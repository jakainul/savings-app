// Keeps stock_quotes up to date from Eulerpool.
//   Prices:     latest official close, every run (saved when the close date changes)
//   Dividends:  forward annual dividend per share (latest x payments per year), at most once a day
//   Profile:    company name and currency, at most once a week
// With 100,000 requests a month there is no need to ration calls: each run
// simply refreshes every stock one after another.
const { db } = require('../database');
const eulerpool = require('./eulerpoolService');

const DIVIDENDS_MAX_AGE_HOURS = 20;
const PROFILE_MAX_AGE_DAYS = 7;

let running = null; // the refresh in progress, if any

const hoursSince = (sqliteUtc) => {
  if (!sqliteUtc) return Infinity;
  const then = new Date(String(sqliteUtc).replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(then) ? (Date.now() - then) / 3600000 : Infinity;
};

const round = (value, decimals) => Math.round(value * 10 ** decimals) / 10 ** decimals;

const getStoredQuote = (ticker) => db.prepare('SELECT * FROM stock_quotes WHERE ticker = ?').get(ticker);

const ensureQuoteRow = (ticker) => {
  db.prepare('INSERT INTO stock_quotes (ticker) VALUES (?) ON CONFLICT(ticker) DO NOTHING').run(ticker);
};

// Save a profile: ISIN, company name, currency
function saveProfile(ticker, profile) {
  ensureQuoteRow(ticker);
  db.prepare(
    `UPDATE stock_quotes SET
       isin = ?, company_name = COALESCE(?, company_name), currency = ?,
       overview_refreshed_at = datetime('now')
     WHERE ticker = ?`
  ).run(profile.isin, profile.name, profile.currency, ticker);
}

/**
 * Save a new close. Daily change is the difference from the previous close that
 * Eulerpool gave us. On the first Eulerpool close for a stock (no previous one
 * yet), the stored change is kept if it is for the same day, otherwise it is 0
 * until the next close arrives.
 */
function savePrice(ticker, eod) {
  const stored = getStoredQuote(ticker);
  const sameDay = stored && stored.timestamp === eod.date;

  let prevClose;
  if (sameDay) {
    prevClose = stored.prev_close;
  } else {
    prevClose = stored && stored.price_source === 'eulerpool' && stored.price > 0 ? stored.price : null;
  }

  let change;
  if (prevClose) {
    change = eod.close - prevClose;
  } else if (sameDay) {
    change = stored.change || 0; // e.g. the last Alpha Vantage change for this same day
  } else {
    change = 0;
  }
  const base = eod.close - change;
  const changePercent = base > 0 ? (change / base) * 100 : 0;

  db.prepare(
    `UPDATE stock_quotes SET
       price = ?, change = ?, change_percent = ?, volume = ?, timestamp = ?,
       prev_close = ?, price_source = 'eulerpool', last_refreshed_at = datetime('now'),
       dividend_yield = CASE WHEN dividend_annual IS NOT NULL AND ? > 0 THEN dividend_annual / ? * 100 ELSE dividend_yield END
     WHERE ticker = ?`
  ).run(
    round(eod.close, 4), round(change, 4), round(changePercent, 4), eod.volume, eod.date,
    prevClose, eod.close, eod.close, ticker
  );
}

// Save dividends and the forward yield they give at the current price
// (forward annual dividend / latest close; the trailing 12 months are kept for reference)
function saveDividends(ticker, dividends) {
  const stored = getStoredQuote(ticker);
  const price = stored?.price || 0;
  const dividendYield = price > 0 && dividends.dividendAnnual > 0 ? (dividends.dividendAnnual / price) * 100 : null;
  db.prepare(
    `UPDATE stock_quotes SET
       dividend_annual = ?, dividend_ttm = ?, dividend_yield = ?, ex_dividend_date = ?,
       dividends_refreshed_at = datetime('now')
     WHERE ticker = ?`
  ).run(
    dividends.dividendAnnual, dividends.dividendTtm,
    dividendYield === null ? null : round(dividendYield, 4), dividends.lastExDate, ticker
  );
}

/**
 * Refresh one stock. Options:
 *   resolveIsin: look up the ISIN via the profile if it isn't known yet
 *   forceDividends / forceProfile: refresh even if the stored data is recent
 * Returns { ticker, updated: [...] }. Throws EulerpoolError on failure.
 */
async function refreshStock(ticker, options = {}) {
  const { resolveIsin = false, forceDividends = false, forceProfile = false } = options;
  const updated = [];
  let stored = getStoredQuote(ticker);

  const profileStale = !stored || !stored.isin || hoursSince(stored.overview_refreshed_at) > PROFILE_MAX_AGE_DAYS * 24;
  if (forceProfile || (profileStale && (stored?.isin || resolveIsin))) {
    const profile = await eulerpool.getProfile(stored?.isin || ticker);
    saveProfile(ticker, profile);
    updated.push('profile');
    stored = getStoredQuote(ticker);
  }

  if (!stored?.isin) {
    throw new eulerpool.EulerpoolError('ISIN_MISSING');
  }

  const eod = await eulerpool.getEndOfDay(stored.isin);
  savePrice(ticker, eod);
  updated.push('price');

  // Refetch daily, or right away if the forward dividend hasn't been calculated yet
  if (forceDividends || stored.dividend_annual == null || hoursSince(stored.dividends_refreshed_at) > DIVIDENDS_MAX_AGE_HOURS) {
    const dividends = await eulerpool.getDividends(stored.isin);
    saveDividends(ticker, dividends);
    updated.push('dividends');
  }

  return { ticker, updated };
}

/**
 * Refresh every stock in the watchlist, one after another.
 * Stops early if the monthly quota is used up or the key is missing/invalid.
 * Concurrent calls share the same run.
 */
function refreshAllStocks(options = {}) {
  if (running) return running;

  running = (async () => {
    const tickers = db.prepare('SELECT ticker FROM stock_watchlist ORDER BY ticker').all().map((r) => r.ticker);
    const summary = { total: tickers.length, refreshed: 0, failed: [], stoppedReason: null };

    for (const ticker of tickers) {
      try {
        await refreshStock(ticker, options);
        summary.refreshed++;
      } catch (err) {
        const code = err.code || err.message;
        if (code === 'ISIN_MISSING') {
          summary.failed.push({ ticker, error: 'ISIN not known yet (run: npm run map-isins)' });
          continue;
        }
        summary.failed.push({ ticker, error: code });
        if (['QUOTA_EXCEEDED', 'API_KEY_INVALID', 'API_KEY_NOT_CONFIGURED'].includes(code)) {
          summary.stoppedReason = code;
          break;
        }
      }
    }

    // Group failures by reason: "3 failed - NOT_FOUND: AAA, BBB; API_NETWORK_ERROR: CCC"
    const byReason = {};
    summary.failed.forEach((f) => (byReason[f.error] = [...(byReason[f.error] || []), f.ticker]));
    const failedText = summary.failed.length
      ? ` (${summary.failed.length} failed - ${Object.entries(byReason).map(([reason, list]) => `${reason}: ${list.join(', ')}`).join('; ')})`
      : '';
    console.log(`🔄 Eulerpool refresh: ${summary.refreshed}/${summary.total} stocks updated${failedText}`);
    return summary;
  })().finally(() => {
    running = null;
  });

  return running;
}

module.exports = { refreshStock, refreshAllStocks, savePrice, saveDividends, saveProfile };
