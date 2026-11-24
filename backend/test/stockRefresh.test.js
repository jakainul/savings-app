// Saving closes and dividends from Eulerpool: daily change, the forward yield,
// and keeping a stock's stored data when a newer close isn't published yet.
const { stubFetch, calls } = require('./support/setup');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { db, initDatabase } = require('../database');
const { savePrice, saveDividends, refreshStock } = require('../services/stockRefresh');

initDatabase();

const quote = (ticker = 'ACME') => db.prepare('SELECT * FROM stock_quotes WHERE ticker = ?').get(ticker);

beforeEach(() => {
  db.exec('DELETE FROM stock_quotes');
  db.prepare("INSERT INTO stock_quotes (ticker, isin, overview_refreshed_at) VALUES ('ACME', 'US0000000001', datetime('now'))").run();
});

test('daily change is measured against the previous close', () => {
  savePrice('ACME', { date: '2026-11-19', close: 100, volume: 1 });
  assert.equal(quote().change, 0); // nothing to compare with yet

  savePrice('ACME', { date: '2026-11-20', close: 105, volume: 1 });
  const q = quote();
  assert.equal(q.prev_close, 100);
  assert.equal(q.change, 5);
  assert.equal(q.change_percent, 5);
  assert.equal(q.timestamp, '2026-11-20');
});

test('saving the same day again keeps the change against the day before', () => {
  savePrice('ACME', { date: '2026-11-19', close: 100, volume: 1 });
  savePrice('ACME', { date: '2026-11-20', close: 105, volume: 1 });
  savePrice('ACME', { date: '2026-11-20', close: 106, volume: 1 }); // corrected close
  const q = quote();
  assert.equal(q.prev_close, 100);
  assert.equal(q.change, 6);
});

test('the forward yield follows the price', () => {
  savePrice('ACME', { date: '2026-11-19', close: 100, volume: 1 });
  saveDividends('ACME', { dividendAnnual: 4, dividendTtm: 3, lastExDate: '2026-10-01' });
  assert.equal(quote().dividend_yield, 4);

  savePrice('ACME', { date: '2026-11-20', close: 80, volume: 1 });
  assert.equal(quote().dividend_yield, 5); // same dividend, lower price
});

test('refreshStock asks for prices and dividends by ISIN', async () => {
  stubFetch([
    { match: '/datasets/eod/US0000000001', body: { data: [{ date: '2026-11-20T00:00:00Z', close: '42.5', volume: 900 }] } },
    { match: '/equity/dividends/US0000000001', body: [{ period: '2026-09-01', dividend: 0.25 }, { period: '2026-06-01', dividend: 0.25 }] },
  ]);

  const result = await refreshStock('ACME');

  assert.deepEqual(result.updated, ['price', 'dividends']);
  assert.ok(calls.every((url) => url.includes('US0000000001')));
  assert.equal(quote().price, 42.5);
  assert.equal(quote().timestamp, '2026-11-20');
});

test('a stock without an ISIN is not looked up by ticker unless asked to', async () => {
  db.exec("UPDATE stock_quotes SET isin = NULL");
  stubFetch([]);
  await assert.rejects(refreshStock('ACME'), { code: 'ISIN_MISSING' });
  assert.equal(calls.length, 0);
});
