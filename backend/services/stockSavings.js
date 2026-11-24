// Builds "Stocks" savings entries from the portfolio's quantity history.
// Each quantity change becomes one entry: shares changed × price × USD→EUR rate.
// Changes recorded before prices were stored are valued at today's price and rate.
const { db } = require('../database');
const { getUsdEurRate } = require('./fxRates');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

async function getStockSavingsEntries() {
  const rows = db.prepare(
    `SELECT h.id, h.ticker, h.old_quantity, h.new_quantity, h.changed_at,
            h.price_usd, h.usd_eur_rate, q.price AS current_price
     FROM stock_quantity_history h
     LEFT JOIN stock_quotes q ON q.ticker = h.ticker
     ORDER BY h.changed_at, h.id`
  ).all();

  if (rows.length === 0) return [];

  const currentRate = rows.some((r) => r.usd_eur_rate == null) ? await getUsdEurRate() : null;

  const entries = [];
  let skipped = 0;

  for (const row of rows) {
    const sharesChange = row.new_quantity - row.old_quantity;
    if (sharesChange === 0) continue;

    const priceEstimated = row.price_usd == null;
    const priceUsd = priceEstimated ? row.current_price : row.price_usd;
    const usdEurRate = row.usd_eur_rate ?? currentRate;

    if (!priceUsd || !usdEurRate) {
      skipped++;
      continue;
    }

    // changed_at is stored in UTC; month/year follow the server's local time
    const changedAt = new Date(row.changed_at.replace(' ', 'T') + 'Z');
    const sign = sharesChange > 0 ? '+' : '';

    entries.push({
      id: `stock-${row.id}`,
      source: 'portfolio',
      category: 'Stocks',
      amount: Math.round(sharesChange * priceUsd * usdEurRate * 100) / 100,
      description: `${row.ticker} ${sign}${sharesChange} shares @ $${priceUsd.toFixed(2)}${priceEstimated ? " (today's price)" : ''}`,
      month: MONTHS[changedAt.getMonth()],
      year: changedAt.getFullYear(),
      created_at: row.changed_at,
      ticker: row.ticker,
      sharesChange,
      priceUsd,
      usdEurRate,
      priceEstimated,
    });
  }

  if (skipped > 0) {
    console.warn(`⚠️  ${skipped} stock change(s) left out of savings: missing price or USD→EUR rate`);
  }

  return entries;
}

module.exports = { getStockSavingsEntries };
