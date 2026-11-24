// Fill a separate demo database with made-up data, so the app can be tried
// without an API key and without any real savings or holdings.
//   npm run seed-demo              create backend/demo.db (refuses if it has data)
//   npm run seed-demo -- --reset   empty backend/demo.db and seed it again
// Everything here is invented: amounts, quantities, prices and dates.
process.env.DB_PATH = process.env.DB_PATH || 'demo.db';

const path = require('path');

// Check before opening anything: budget.db holds real data
if (path.basename(process.env.DB_PATH) === 'budget.db') {
  console.error('Refusing to seed budget.db, which holds real data. Use DB_PATH=demo.db.');
  process.exit(1);
}

const { db, dbPath, initDatabase } = require('../database');

initDatabase();

const reset = process.argv.includes('--reset');
const TABLES = ['savings', 'stock_watchlist', 'stock_quotes', 'stock_holdings', 'stock_quantity_history', 'fx_rates', 'api_quota'];
const rowCount = TABLES.reduce((n, t) => n + db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0);
if (rowCount > 0 && !reset) {
  console.log(`${path.basename(dbPath)} already has data. Run with --reset to replace it.`);
  process.exit(0);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTHS_OF_HISTORY = 18;

const sqlTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const isoDay = (date) => date.toISOString().slice(0, 10);

// Most recent weekday before the given date (a stand-in for the last trading day)
const previousWeekday = (date) => {
  const d = new Date(date);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d;
};

// First day of the month `monthsAgo` months before now, at noon UTC
const monthStart = (monthsAgo) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1, 12));
};

// Made-up stocks. ISINs are the public identifiers, so a real Eulerpool key
// can refresh them later; prices and dividends are illustrative only.
const STOCKS = [
  { ticker: 'AAPL', name: 'Apple Inc.', isin: 'US0378331005', price: 228.4, prevClose: 226.1, dividendAnnual: 1.04 },
  { ticker: 'MSFT', name: 'Microsoft Corp.', isin: 'US5949181045', price: 431.2, prevClose: 434.9, dividendAnnual: 3.32 },
  { ticker: 'KO', name: 'The Coca-Cola Company', isin: 'US1912161007', price: 68.3, prevClose: 68.0, dividendAnnual: 2.04 },
  { ticker: 'JNJ', name: 'Johnson & Johnson', isin: 'US4781601046', price: 155.7, prevClose: 156.2, dividendAnnual: 4.96 },
  // One close a day behind the others, to show the out-of-date marker
  { ticker: 'PG', name: 'Procter & Gamble Co.', isin: 'US7427181091', price: 167.9, prevClose: 166.5, dividendAnnual: 4.03, stale: true },
];

// Quantity changes: [ticker, months ago, new quantity, price then (USD), USD→EUR then]
const QUANTITY_CHANGES = [
  ['AAPL', 17, 10, 186.0, 0.92],
  ['MSFT', 16, 5, 402.5, 0.93],
  ['KO', 14, 40, 61.2, 0.92],
  ['JNJ', 12, 15, 148.9, 0.91],
  ['AAPL', 10, 18, 214.3, 0.90],
  ['PG', 8, 12, 159.0, 0.90],
  ['KO', 6, 55, 64.8, 0.88],
  ['JNJ', 4, 10, 152.1, 0.87],   // a partial sale
  ['MSFT', 2, 8, 420.7, 0.86],
  ['AAPL', 1, 22, 225.0, 0.86],
];

const latestClose = previousWeekday(new Date());
const staleClose = previousWeekday(latestClose);

db.transaction(() => {
  if (reset) {
    TABLES.forEach((t) => db.exec(`DELETE FROM ${t}`));
  }

  // Monthly savings: an ETF amount and a savings-account amount
  const insertSaving = db.prepare(
    'INSERT INTO savings (amount, description, category, month, year, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (let ago = MONTHS_OF_HISTORY - 1; ago >= 0; ago--) {
    const date = monthStart(ago);
    const month = MONTHS[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const etf = 400 + ((MONTHS_OF_HISTORY - ago) % 4) * 50; // 400-550
    const account = ago % 6 === 0 ? 300 : 150;
    insertSaving.run(etf, 'Monthly ETF savings', 'ETFs', month, year, sqlTime(date));
    insertSaving.run(account, 'Buffer account', 'Savings Account', month, year, sqlTime(date));
  }

  // Watchlist and stored quotes
  const insertTicker = db.prepare('INSERT INTO stock_watchlist (ticker, added_at) VALUES (?, ?)');
  const insertQuote = db.prepare(
    `INSERT INTO stock_quotes (
       ticker, price, change, change_percent, volume, timestamp, company_name,
       dividend_yield, dividend_annual, dividend_ttm, isin, currency, prev_close, price_source,
       last_refreshed_at, overview_refreshed_at, dividends_refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, 'demo', datetime('now'), datetime('now'), datetime('now'))`
  );
  for (const s of STOCKS) {
    const change = s.price - s.prevClose;
    insertTicker.run(s.ticker, sqlTime(monthStart(MONTHS_OF_HISTORY)));
    insertQuote.run(
      s.ticker, s.price, Math.round(change * 100) / 100, Math.round((change / s.prevClose) * 10000) / 100,
      1000000, isoDay(s.stale ? staleClose : latestClose), s.name,
      Math.round((s.dividendAnnual / s.price) * 10000) / 100, s.dividendAnnual, s.dividendAnnual, s.isin, s.prevClose
    );
  }

  // Quantity history (each change becomes a Stocks savings entry) and current holdings
  const insertChange = db.prepare(
    `INSERT INTO stock_quantity_history (ticker, old_quantity, new_quantity, changed_at, price_usd, usd_eur_rate)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const quantities = {};
  for (const [ticker, monthsAgo, newQuantity, priceUsd, usdEur] of QUANTITY_CHANGES) {
    const changedAt = monthStart(monthsAgo);
    changedAt.setUTCDate(15);
    insertChange.run(ticker, quantities[ticker] || 0, newQuantity, sqlTime(changedAt), priceUsd, usdEur);
    quantities[ticker] = newQuantity;
  }
  const insertHolding = db.prepare('INSERT INTO stock_holdings (ticker, quantity) VALUES (?, ?)');
  for (const s of STOCKS) {
    insertHolding.run(s.ticker, quantities[s.ticker] || 0);
  }

  // A recent USD→EUR rate, so euro values work offline
  db.prepare('INSERT INTO fx_rates (date, usd_eur) VALUES (?, ?)').run(isoDay(latestClose), 0.86);
})();

console.log(`Seeded ${path.basename(dbPath)} with made-up data: ${MONTHS_OF_HISTORY} months of savings, ${STOCKS.length} stocks, ${QUANTITY_CHANGES.length} quantity changes.`);
console.log('Start the app on it with: ./start.sh --demo');
db.close();
