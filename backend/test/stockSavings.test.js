// Every change in a stock's share quantity becomes a Stocks savings entry,
// valued at shares changed x price x USD→EUR rate.
const { stubFetch } = require('./support/setup');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { db, initDatabase } = require('../database');
const { getStockSavingsEntries } = require('../services/stockSavings');

initDatabase();

const addChange = (ticker, oldQty, newQty, changedAt, priceUsd, rate) =>
  db.prepare(
    `INSERT INTO stock_quantity_history (ticker, old_quantity, new_quantity, changed_at, price_usd, usd_eur_rate)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(ticker, oldQty, newQty, changedAt, priceUsd, rate);

beforeEach(() => {
  for (const t of ['stock_quantity_history', 'stock_quotes', 'fx_rates']) db.exec(`DELETE FROM ${t}`);
  db.prepare("INSERT INTO stock_quotes (ticker, price) VALUES ('ACME', 200)").run();
  stubFetch([]); // any network call fails the test
});

test('buys and sales use the price and rate stored with the change', async () => {
  addChange('ACME', 0, 10, '2026-03-15 10:00:00', 150, 0.9);
  addChange('ACME', 10, 4, '2026-06-15 10:00:00', 180, 0.9);

  const [buy, sale] = await getStockSavingsEntries();

  assert.equal(buy.amount, 1350); // 10 x 150 x 0.9
  assert.equal(buy.description, 'ACME +10 shares @ $150.00');
  assert.equal(buy.category, 'Stocks');
  assert.equal(sale.amount, -972); // -6 x 180 x 0.9
  assert.equal(sale.sharesChange, -6);
});

test("older changes without a stored price use today's price and the latest stored rate", async () => {
  db.prepare("INSERT INTO fx_rates (date, usd_eur) VALUES ('2026-11-20', 0.8)").run();
  addChange('ACME', 0, 2, '2025-01-10 10:00:00', null, null);

  const [entry] = await getStockSavingsEntries();

  assert.equal(entry.amount, 320); // 2 x 200 x 0.8
  assert.equal(entry.priceEstimated, true);
  assert.match(entry.description, /today's price/);
});

test('changes that leave the quantity the same are skipped', async () => {
  addChange('ACME', 5, 5, '2026-03-15 10:00:00', 150, 0.9);
  assert.deepEqual(await getStockSavingsEntries(), []);
});

test('a change with no price at all is left out instead of counted as zero', async () => {
  db.exec("DELETE FROM stock_quotes");
  db.prepare("INSERT INTO fx_rates (date, usd_eur) VALUES ('2026-11-20', 0.8)").run();
  addChange('ACME', 0, 3, '2026-03-15 10:00:00', null, null);
  assert.deepEqual(await getStockSavingsEntries(), []);
});
