// Forward dividend yield: the latest dividend x payments per year, so a raise
// shows up right away instead of a year later (the trailing figure lags).
require('./support/setup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeDividends } = require('../services/eulerpoolService');

const NOW = new Date('2026-11-01T12:00:00Z');
const pay = (period, dividend) => ({ period, dividend });

test('a quarterly raise counts in full in the forward dividend', () => {
  const result = summarizeDividends(
    [pay('2025-12-01', 0.01), pay('2026-03-02', 0.01), pay('2026-06-01', 0.01), pay('2026-09-01', 0.25)],
    NOW
  );
  assert.equal(result.paymentsPerYear, 4);
  assert.equal(result.latestDividend, 0.25);
  assert.equal(result.dividendAnnual, 1);
  assert.equal(result.dividendTtm, 0.28); // trailing 12 months still mostly the old dividend
  assert.equal(result.lastExDate, '2026-09-01');
});

test('monthly payers are recognised from the gap between ex-dates', () => {
  const months = ['2026-05-15', '2026-06-15', '2026-07-15', '2026-08-14', '2026-09-15', '2026-10-15'];
  const result = summarizeDividends(months.map((m) => pay(m, 0.1)), NOW);
  assert.equal(result.paymentsPerYear, 12);
  assert.equal(result.dividendAnnual, 1.2);
});

test('dividends that have stopped give a forward dividend of zero', () => {
  const result = summarizeDividends(
    [pay('2024-07-15', 0.5), pay('2024-10-15', 0.5), pay('2025-01-15', 0.5)],
    NOW
  );
  assert.equal(result.dividendAnnual, 0);
  assert.equal(result.paymentsPerYear, 0);
  assert.equal(result.dividendTtm, 0);
});

test('announced future dividends and bad rows are ignored', () => {
  const result = summarizeDividends(
    [pay('2026-08-01', 0.4), pay('2026-05-01', 0.4), pay('2026-12-01', 9), pay(null, 1), pay('2026-02-01', 'n/a'), pay('2026-02-01', 0.4)],
    NOW
  );
  assert.equal(result.lastExDate, '2026-08-01');
  assert.equal(result.dividendAnnual, 1.6);
});

test('an empty or missing history gives no dividend', () => {
  for (const input of [[], null, undefined]) {
    const result = summarizeDividends(input, NOW);
    assert.equal(result.dividendAnnual, 0);
    assert.equal(result.latestDividend, null);
  }
});
