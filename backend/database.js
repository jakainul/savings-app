const path = require('path');
const Database = require('better-sqlite3');

// Open (or create) the database file next to this module. DB_PATH picks another
// file (relative paths start from this folder): demo.db for demo mode, or
// :memory: for tests, so neither ever touches your real data in budget.db.
const dbPath = !process.env.DB_PATH
  ? path.join(__dirname, 'budget.db')
  : process.env.DB_PATH === ':memory:'
    ? ':memory:'
    : path.resolve(__dirname, process.env.DB_PATH);
const db = new Database(dbPath);

// The previous sqlite3 driver ran with foreign key enforcement off.
// better-sqlite3 turns it on by default, so keep the old behaviour explicitly.
db.pragma('foreign_keys = OFF');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS savings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK(category IN ('ETFs', 'Stocks', 'Savings Account')),
    month TEXT NOT NULL,
    year INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Cached quote and overview data
  CREATE TABLE IF NOT EXISTS stock_quotes (
    ticker TEXT PRIMARY KEY,
    price REAL NOT NULL DEFAULT 0,
    change REAL NOT NULL DEFAULT 0,
    change_percent REAL NOT NULL DEFAULT 0,
    volume INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT,
    company_name TEXT,
    dividend_yield REAL,
    ex_dividend_date TEXT,
    last_refreshed_at DATETIME,
    overview_refreshed_at DATETIME,
    isin TEXT,
    currency TEXT,
    prev_close REAL,
    price_source TEXT,
    dividend_ttm REAL,
    dividend_annual REAL,
    dividends_refreshed_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_stock_quotes_last_refreshed ON stock_quotes(last_refreshed_at);
  CREATE INDEX IF NOT EXISTS idx_stock_quotes_overview_refreshed ON stock_quotes(overview_refreshed_at);

  CREATE TABLE IF NOT EXISTS stock_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticker) REFERENCES stock_watchlist(ticker) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_stock_holdings_ticker ON stock_holdings(ticker);

  -- Audit trail of quantity changes
  CREATE TABLE IF NOT EXISTS stock_quantity_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    old_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    price_usd REAL,
    usd_eur_rate REAL,
    FOREIGN KEY (ticker) REFERENCES stock_watchlist(ticker) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_stock_quantity_history_ticker ON stock_quantity_history(ticker);
  CREATE INDEX IF NOT EXISTS idx_stock_quantity_history_date ON stock_quantity_history(changed_at DESC);

  -- Last-known request quota reported by the stock data provider
  CREATE TABLE IF NOT EXISTS api_quota (
    provider TEXT PRIMARY KEY,
    quota_limit INTEGER,
    remaining INTEGER,
    resets_at INTEGER,
    updated_at DATETIME
  );

  -- Daily USD -> EUR exchange rates (European Central Bank)
  CREATE TABLE IF NOT EXISTS fx_rates (
    date TEXT PRIMARY KEY,
    usd_eur REAL NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const DIVIDEND_MIGRATION_ID = 'dividend_decimal_to_percentage_v2';
const DROP_SALARIES_MIGRATION_ID = 'drop_salaries_table';
const DELETE_MANUAL_STOCK_SAVINGS_ID = 'delete_manual_stock_savings';
const DROP_API_CALL_LOG_ID = 'drop_api_call_log';

// Add a column to an existing table if it isn't there yet
const addColumnIfMissing = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

// Create tables and apply one-off migrations. Synchronous; throws on failure.
const initDatabase = () => {
  db.exec(SCHEMA);

  // Price and exchange rate at the time of each quantity change
  addColumnIfMissing('stock_quantity_history', 'price_usd', 'REAL');
  addColumnIfMissing('stock_quantity_history', 'usd_eur_rate', 'REAL');

  // Eulerpool data: ISIN (used for price lookups), currency, previous close
  // (for daily change), where the price came from, dividends (trailing 12
  // months and forward annual)
  addColumnIfMissing('stock_quotes', 'isin', 'TEXT');
  addColumnIfMissing('stock_quotes', 'currency', 'TEXT');
  addColumnIfMissing('stock_quotes', 'prev_close', 'REAL');
  addColumnIfMissing('stock_quotes', 'price_source', 'TEXT');
  addColumnIfMissing('stock_quotes', 'dividend_ttm', 'REAL');
  addColumnIfMissing('stock_quotes', 'dividend_annual', 'REAL');
  addColumnIfMissing('stock_quotes', 'dividends_refreshed_at', 'DATETIME');

  const applied = db
    .prepare('SELECT migration_id FROM schema_migrations WHERE migration_id = ?')
    .get(DIVIDEND_MIGRATION_ID);

  if (applied) {
    console.log('✅ Dividend yield migration already applied, skipping');
  } else {
    // Convert old decimal-format dividend yields (< 0.1) to percentages.
    // Values like 0.51 or 0.73 are already percentages and are left alone.
    db.transaction(() => {
      db.prepare(`
        UPDATE stock_quotes
        SET dividend_yield = dividend_yield * 100
        WHERE dividend_yield IS NOT NULL
          AND dividend_yield > 0
          AND dividend_yield < 0.1
      `).run();
      db.prepare('INSERT INTO schema_migrations (migration_id) VALUES (?)').run(DIVIDEND_MIGRATION_ID);
    })();
    console.log('✅ Migrated dividend yields from decimal to percentage format (v2 - fixed threshold)');
  }

  // Salaries were removed from the app; delete the old table and its data once
  const salariesDropped = db
    .prepare('SELECT migration_id FROM schema_migrations WHERE migration_id = ?')
    .get(DROP_SALARIES_MIGRATION_ID);
  if (!salariesDropped) {
    const hadSalaries = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'salaries'")
      .get();
    db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS salaries');
      db.prepare('INSERT INTO schema_migrations (migration_id) VALUES (?)').run(DROP_SALARIES_MIGRATION_ID);
    })();
    if (hadSalaries) {
      console.log('✅ Removed the salaries table (salaries are no longer part of the app)');
    }
  }

  // Stocks now come from the portfolio; remove manually entered Stocks savings once
  const manualStocksDeleted = db
    .prepare('SELECT migration_id FROM schema_migrations WHERE migration_id = ?')
    .get(DELETE_MANUAL_STOCK_SAVINGS_ID);
  if (!manualStocksDeleted) {
    const removed = db.transaction(() => {
      const info = db.prepare("DELETE FROM savings WHERE category = 'Stocks'").run();
      db.prepare('INSERT INTO schema_migrations (migration_id) VALUES (?)').run(DELETE_MANUAL_STOCK_SAVINGS_ID);
      return info.changes;
    })();
    if (removed > 0) {
      console.log(`✅ Removed ${removed} manual Stocks savings entries (stocks now come from the portfolio)`);
    }
  }

  // The Alpha Vantage daily call counter is no longer used
  const callLogDropped = db
    .prepare('SELECT migration_id FROM schema_migrations WHERE migration_id = ?')
    .get(DROP_API_CALL_LOG_ID);
  if (!callLogDropped) {
    db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS api_call_log');
      db.prepare('INSERT INTO schema_migrations (migration_id) VALUES (?)').run(DROP_API_CALL_LOG_ID);
    })();
  }

  console.log('Database initialized successfully (including portfolio tables)');
};

module.exports = { db, dbPath, initDatabase };
