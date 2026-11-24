// USD → EUR exchange rates from the European Central Bank, via the free
// Frankfurter API (no API key, does not use the Eulerpool request quota).
// Rates are stored in the fx_rates table so the app keeps working offline.
const { db } = require('../database');

const FX_URL = 'https://api.frankfurter.dev/v2/rate/USD/EUR';

function getLatestStoredRate() {
  return db.prepare('SELECT date, usd_eur FROM fx_rates ORDER BY date DESC LIMIT 1').get() || null;
}

// Fetch the latest rate and store it. Returns { date, usd_eur } or null on failure.
async function refreshUsdEurRate() {
  try {
    const response = await fetch(FX_URL, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json();
    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('unexpected response');
    }
    const date = typeof body.date === 'string' ? body.date : new Date().toISOString().slice(0, 10);

    db.prepare(
      `INSERT INTO fx_rates (date, usd_eur, fetched_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET
         usd_eur = excluded.usd_eur,
         fetched_at = excluded.fetched_at`
    ).run(date, rate);

    console.log(`💱 USD→EUR rate: ${rate} (${date})`);
    return { date, usd_eur: rate };
  } catch (err) {
    console.warn('⚠️  Could not fetch USD→EUR exchange rate:', err.message);
    return null;
  }
}

// Latest known USD→EUR rate. Fetches one if none has been stored yet.
// Returns null only if no rate has ever been available.
async function getUsdEurRate() {
  const stored = getLatestStoredRate();
  if (stored) return stored.usd_eur;
  const fetched = await refreshUsdEurRate();
  return fetched ? fetched.usd_eur : null;
}

module.exports = { getUsdEurRate, refreshUsdEurRate, getLatestStoredRate };
