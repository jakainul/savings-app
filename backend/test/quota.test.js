// The free API quota is precious: a used-up quota or a rejected key must stop
// the whole refresh at once, not retry stock after stock. (An earlier retry
// loop with the first data provider used up a whole day's quota this way.)
// Runs in its own file because the "quota used up" pause is module state.
const { stubFetch, calls } = require('./support/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { db, initDatabase } = require('../database');
const { refreshAllStocks } = require('../services/stockRefresh');
const { getQuota } = require('../services/eulerpoolService');

initDatabase();

const resetsAt = Math.floor(Date.now() / 1000) + 3600;

for (const [ticker, isin] of [['AAA', 'XX0000000001'], ['BBB', 'XX0000000002'], ['CCC', 'XX0000000003']]) {
  db.prepare('INSERT INTO stock_watchlist (ticker) VALUES (?)').run(ticker);
  db.prepare(
    "INSERT INTO stock_quotes (ticker, isin, overview_refreshed_at, dividend_annual, dividends_refreshed_at) VALUES (?, ?, datetime('now'), 1, datetime('now'))"
  ).run(ticker, isin);
}

test('a used-up quota stops the refresh and pauses further calls', async () => {
  stubFetch([
    {
      match: '/datasets/eod/XX0000000001',
      body: { data: [{ date: '2026-11-20', close: 10, volume: 1 }] },
      headers: { 'x-ratelimit-limit': '100000', 'x-ratelimit-remaining': '1', 'x-ratelimit-reset': String(resetsAt) },
    },
    { match: '/datasets/eod/', status: 429, headers: { 'x-ratelimit-reset': String(resetsAt) } },
  ]);

  const summary = await refreshAllStocks();

  assert.equal(summary.refreshed, 1);
  assert.equal(summary.stoppedReason, 'QUOTA_EXCEEDED');
  assert.equal(calls.length, 2, 'the third stock must not be requested');
  assert.equal(getQuota().remaining, 1);

  // Until the reset time, nothing is sent at all
  const again = await refreshAllStocks();
  assert.equal(again.stoppedReason, 'QUOTA_EXCEEDED');
  assert.equal(calls.length, 2);
});
