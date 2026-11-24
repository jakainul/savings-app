// Stock data from Eulerpool (https://eulerpool.com/developers).
// Free plan: 100,000 requests per month, end-of-day prices. Non-commercial use;
// public-facing products must credit "Data by Eulerpool".
//
// Prices are always requested by ISIN: some tickers are ambiguous on the
// price endpoints (the same symbol can match a different security).
require('../env');
const { db } = require('../database');

const BASE_URL = 'https://api.eulerpool.com/api/1';
const API_KEY = (process.env.EULERPOOL_API_KEY || '').trim();
const REQUEST_TIMEOUT_MS = 15000;

const isApiKeyConfigured = () => API_KEY !== '' && API_KEY !== 'YOUR_KEY';

if (!isApiKeyConfigured()) {
  console.error('❌ EULERPOOL_API_KEY is not configured in backend/.env - stock prices will not update.');
} else {
  console.log('✅ Eulerpool API key loaded');
}

// Error with a machine-readable code:
//   API_KEY_NOT_CONFIGURED, API_KEY_INVALID, NOT_FOUND, QUOTA_EXCEEDED,
//   API_NETWORK_ERROR, API_REQUEST_FAILED
class EulerpoolError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

// After a 429 (monthly quota used up), don't call again until the quota resets
let quotaExhaustedUntil = 0;

const mask = (text) => (API_KEY ? String(text).split(API_KEY).join('***') : String(text));

// Remember the quota headers Eulerpool sends with every response
function recordQuota(headers) {
  const limit = Number(headers.get('x-ratelimit-limit'));
  const remaining = Number(headers.get('x-ratelimit-remaining'));
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(remaining) || headers.get('x-ratelimit-remaining') === null) return;

  db.prepare(
    `INSERT INTO api_quota (provider, quota_limit, remaining, resets_at, updated_at)
     VALUES ('eulerpool', ?, ?, ?, datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET
       quota_limit = excluded.quota_limit,
       remaining = excluded.remaining,
       resets_at = excluded.resets_at,
       updated_at = excluded.updated_at`
  ).run(Number.isFinite(limit) ? limit : null, remaining, Number.isFinite(reset) ? reset : null);
}

// Last-known quota: { limit, remaining, resetsAt (ISO), updatedAt } or null
function getQuota() {
  const row = db.prepare("SELECT * FROM api_quota WHERE provider = 'eulerpool'").get();
  if (!row) return null;
  return {
    limit: row.quota_limit,
    remaining: row.remaining,
    resetsAt: row.resets_at ? new Date(row.resets_at * 1000).toISOString() : null,
    updatedAt: row.updated_at,
  };
}

async function request(path) {
  if (!isApiKeyConfigured()) {
    throw new EulerpoolError('API_KEY_NOT_CONFIGURED');
  }
  if (Date.now() < quotaExhaustedUntil) {
    throw new EulerpoolError('QUOTA_EXCEEDED', new Date(quotaExhaustedUntil).toISOString());
  }

  let response;
  try {
    response = await fetch(BASE_URL + path, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`❌ Eulerpool ${path}: ${mask(err.message)}`);
    throw new EulerpoolError('API_NETWORK_ERROR');
  }

  try {
    recordQuota(response.headers);
  } catch (err) {
    console.warn('⚠️  Could not store Eulerpool quota:', err.message);
  }

  if (response.status === 401 || response.status === 403) {
    throw new EulerpoolError('API_KEY_INVALID');
  }
  if (response.status === 404) {
    throw new EulerpoolError('NOT_FOUND');
  }
  if (response.status === 429) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    // Fall back to one hour if the reset time is missing
    quotaExhaustedUntil = Number.isFinite(reset) && reset > 0 ? reset * 1000 : Date.now() + 60 * 60 * 1000;
    console.warn(`⚠️  Eulerpool monthly quota used up; pausing until ${new Date(quotaExhaustedUntil).toISOString()}`);
    throw new EulerpoolError('QUOTA_EXCEEDED', new Date(quotaExhaustedUntil).toISOString());
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn(`⚠️  Eulerpool ${path}: HTTP ${response.status} ${mask(text.slice(0, 200))}`);
    throw new EulerpoolError('API_REQUEST_FAILED', `HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new EulerpoolError('API_REQUEST_FAILED', 'invalid JSON');
  }
}

const toNumber = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Latest official daily close: { date: 'YYYY-MM-DD', close, volume }
 */
async function getEndOfDay(isin) {
  const body = await request(`/datasets/eod/${encodeURIComponent(isin)}`);
  const day = Array.isArray(body?.data) ? body.data[0] : null;
  const close = toNumber(day?.close);
  if (!day || close === null || close <= 0 || typeof day.date !== 'string') {
    throw new EulerpoolError('NOT_FOUND', 'no end-of-day data');
  }
  return {
    date: day.date.slice(0, 10),
    close,
    volume: Math.round(toNumber(day.volume) || 0),
  };
}

/**
 * Company profile (accepts ticker or ISIN): { isin, name, currency, sector, country }
 */
async function getProfile(identifier) {
  const body = await request(`/equity/profile/${encodeURIComponent(identifier)}`);
  if (!body || typeof body.isin !== 'string' || body.isin === '') {
    throw new EulerpoolError('NOT_FOUND', 'no profile');
  }
  return {
    isin: body.isin,
    name: body.name || null,
    currency: body.currency || null,
    sector: body.sector || null,
    country: body.country || null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / DAY_MS);

// Payments per year from the typical gap between ex-dates
const paymentsPerYearFromGap = (gapDays) => {
  if (gapDays <= 45) return 12; // monthly
  if (gapDays <= 135) return 4; // quarterly
  if (gapDays <= 270) return 2; // half-yearly
  return 1; // yearly
};

/**
 * Summarise a dividend history (amounts per share, by ex-date "period"):
 *   dividendAnnual   forward: latest dividend x payments per year (0 if dividends stopped)
 *   dividendTtm      dividends with an ex-date in the last 12 months
 *   latestDividend, paymentsPerYear, lastExDate
 * The forward figure follows dividend changes right away; the trailing one lags
 * for a year after a raise (e.g. a quarterly dividend going from $0.01 to $0.25).
 */
function summarizeDividends(payments, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const from = yearAgo.toISOString().slice(0, 10);

  const list = (Array.isArray(payments) ? payments : [])
    .map((p) => ({
      exDate: typeof p?.period === 'string' ? p.period.slice(0, 10) : null,
      amount: toNumber(p?.dividend),
    }))
    .filter((p) => p.exDate && p.amount !== null && p.amount > 0 && p.exDate <= today)
    .sort((a, b) => (a.exDate < b.exDate ? -1 : 1));

  const dividendTtm = list.filter((p) => p.exDate > from).reduce((sum, p) => sum + p.amount, 0);
  const latest = list[list.length - 1] || null;

  // Typical gap between the last few ex-dates (median of up to 4 gaps)
  const recent = list.slice(-5);
  const gaps = recent.slice(1).map((p, i) => daysBetween(recent[i].exDate, p.exDate)).filter((g) => g > 0);
  gaps.sort((a, b) => a - b);
  const typicalGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 365;
  const paymentsPerYear = paymentsPerYearFromGap(typicalGap);

  // Dividends have stopped if the next payment is well overdue
  const stopped = !latest || daysBetween(latest.exDate, today) > Math.max(typicalGap * 1.5, 400);
  const dividendAnnual = stopped ? 0 : latest.amount * paymentsPerYear;

  return {
    dividendAnnual: Math.round(dividendAnnual * 1e6) / 1e6,
    dividendTtm: Math.round(dividendTtm * 1e6) / 1e6,
    latestDividend: latest ? latest.amount : null,
    paymentsPerYear: stopped ? 0 : paymentsPerYear,
    lastExDate: latest ? latest.exDate : null,
  };
}

/**
 * Dividend history for a stock, summarised (see summarizeDividends)
 */
async function getDividends(isin, now = new Date()) {
  const body = await request(`/equity/dividends/${encodeURIComponent(isin)}`);
  return summarizeDividends(body, now);
}

/**
 * Search by name, ticker or ISIN: [{ name, isin, ticker, type, currency }]
 */
async function search(query) {
  const body = await request(`/equity/search?q=${encodeURIComponent(query)}`);
  return Array.isArray(body?.results) ? body.results : [];
}

module.exports = {
  EulerpoolError,
  isApiKeyConfigured,
  getEndOfDay,
  getProfile,
  getDividends,
  summarizeDividends,
  search,
  getQuota,
};
