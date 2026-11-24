require('./env');

// Validate API key is loaded
if (!process.env.EULERPOOL_API_KEY) {
  console.warn('⚠️  WARNING: EULERPOOL_API_KEY not found in environment variables!');
  console.warn('⚠️  Add it to backend/.env (see .env.example). Get a free key at https://eulerpool.com/developers');
}
const express = require('express');
const { db, initDatabase } = require('./database');
const { startSchedulers, STOCK_REFRESH_HOURS } = require('./services/scheduler');
const { getStockSavingsEntries } = require('./services/stockSavings');
const { getUsdEurRate } = require('./services/fxRates');
const stockService = require('./services/eulerpoolService');
const { refreshStock, refreshAllStocks, savePrice, saveDividends, saveProfile } = require('./services/stockRefresh');

const app = express();
const PORT = process.env.PORT || 5001;
// Only accept connections from this computer
const HOST = process.env.HOST || '127.0.0.1';

// Reject requests addressed to any other host name (protects against
// DNS rebinding: a website pointing its own domain at 127.0.0.1)
const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
app.use((req, res, next) => {
  const hostname = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (!ALLOWED_HOSTNAMES.has(hostname)) {
    res.status(403).json({ error: 'Forbidden host' });
    return;
  }
  next();
});

// No CORS headers: the frontend reaches the API through the Vite dev server
// proxy (same origin), so other websites cannot read or change your data.
app.use(express.json());

// Initialize database (synchronous with better-sqlite3)
try {
  initDatabase();
  console.log('Database ready for connections');
} catch (err) {
  console.error('FATAL: Failed to initialize database:', err);
  console.error('Server cannot start without a working database connection.');
  throw err;
}

// Express 5 leaves req.body undefined when a request has no JSON body
const bodyOf = (req) => req.body ?? {};

// Map stock data (Eulerpool) errors to HTTP responses
const stockErrorResponse = (error, notFoundMessage) => {
  const code = error.code || error.message;
  switch (code) {
    case 'NOT_FOUND':
      return [404, notFoundMessage];
    case 'QUOTA_EXCEEDED': {
      const resetsAt = error.detail ? new Date(error.detail).toLocaleDateString() : 'next month';
      return [429, `Eulerpool's monthly request quota is used up. It resets on ${resetsAt}.`];
    }
    case 'API_KEY_NOT_CONFIGURED':
      return [500, 'Eulerpool API key not configured. Add EULERPOOL_API_KEY to backend/.env.'];
    case 'API_KEY_INVALID':
      return [500, 'Eulerpool rejected the API key. Check EULERPOOL_API_KEY in backend/.env.'];
    case 'API_NETWORK_ERROR':
      return [503, 'Unable to reach Eulerpool. Please try again later.'];
    case 'ISIN_MISSING':
      return [409, 'This stock has no ISIN yet. Run: cd backend && npm run map-isins'];
    default:
      return [502, 'Eulerpool request failed. Please try again later.'];
  }
};

const sendStockServiceError = (res, error, notFoundMessage = 'Stock not found') => {
  const [status, message] = stockErrorResponse(error, notFoundMessage);
  res.status(status).json({ error: message });
};

// Routes

// Root route - API information
app.get('/', (req, res) => {
  res.json({
    message: 'Savings Master API Server',
    version: '1.0.0',
    endpoints: [
      'GET /api/savings - Get all savings (manual ETF/savings entries plus stock entries from the portfolio)',
      'POST /api/savings - Add new ETF or savings account entry',
      'POST /api/savings/allocation - Add ETF and savings account entries from percentage allocation',
      'DELETE /api/savings/:id - Delete savings entry',
      'GET /api/stocks/watchlist - Get all stock tickers in watchlist',
      'GET /api/stocks/watchlist/full - Get watchlist with holdings and quotes',
      'POST /api/stocks/watchlist - Add ticker to watchlist',
      'DELETE /api/stocks/watchlist/:ticker - Remove ticker from watchlist',
      'GET /api/stocks/quotes - Get stored quotes for watchlist tickers',
      'POST /api/stocks/refresh - Refresh all stocks from Eulerpool now',
      'POST /api/stocks/refresh/:ticker - Refresh one stock from Eulerpool now',
      'GET /api/stocks/status - Data source, refresh interval and remaining Eulerpool quota',
      'GET /api/stocks/holdings - Get all holdings',
      'GET /api/stocks/holdings/:ticker - Get one holding',
      'PUT /api/stocks/holdings/:ticker - Update holding quantity',
      'GET /api/stocks/portfolio/summary - Get portfolio summary with values',
      'GET /health - Health check'
    ]
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Categories that can be entered manually. Stocks come from the portfolio.
const MANUAL_CATEGORIES = ['ETFs', 'Savings Account'];

// Get all savings: manual ETF/savings entries plus one Stocks entry per
// portfolio quantity change, newest first
app.get('/api/savings', async (req, res) => {
  const manual = db
    .prepare("SELECT * FROM savings WHERE category != 'Stocks' ORDER BY created_at DESC")
    .all()
    .map((row) => ({ ...row, source: 'manual' }));
  const fromPortfolio = await getStockSavingsEntries();

  // Newest first; entries from the same second keep their insertion order
  const seq = (entry) => Number(String(entry.id).replace('stock-', '')) || 0;
  const all = [...manual, ...fromPortfolio].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')) || seq(b) - seq(a)
  );
  res.json(all);
});

// Add new savings entry
app.post('/api/savings', (req, res) => {
  const { amount, description, category, month, year } = bodyOf(req);

  if (!amount || !category || !month || !year) {
    res.status(400).json({ error: 'Amount, category, month, and year are required' });
    return;
  }

  if (!MANUAL_CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'Category must be ETFs or Savings Account. Stocks are added by changing quantities in the portfolio.' });
    return;
  }

  const info = db
    .prepare('INSERT INTO savings (amount, description, category, month, year) VALUES (?, ?, ?, ?, ?)')
    .run(amount, description || '', category, month, year);

  res.json({
    id: info.lastInsertRowid,
    amount,
    description,
    category,
    month,
    year,
    message: 'Savings entry added successfully'
  });
});

// Add bulk savings entries from allocation (ETFs and Savings Account only)
app.post('/api/savings/allocation', (req, res) => {
  const {
    monthlyAmount,
    description,
    etfPercentage,
    stockPercentage,
    savingsPercentage,
    selectedMonth,
    year
  } = bodyOf(req);

  if (!monthlyAmount || etfPercentage === undefined ||
      savingsPercentage === undefined || !selectedMonth || !year) {
    res.status(400).json({ error: 'All allocation fields are required' });
    return;
  }

  if (stockPercentage) {
    res.status(400).json({ error: 'Stocks can no longer be allocated here. Change stock quantities in the portfolio instead.' });
    return;
  }

  // Validate percentages sum to 100
  if (Math.abs((etfPercentage + savingsPercentage) - 100) > 0.01) {
    res.status(400).json({ error: 'Percentages must sum to 100%' });
    return;
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (!months.includes(selectedMonth)) {
    res.status(400).json({ error: 'Invalid selected month' });
    return;
  }

  // One entry per category with a non-zero percentage
  const allocation = [
    { category: 'ETFs', percentage: etfPercentage },
    { category: 'Savings Account', percentage: savingsPercentage }
  ];
  const insertions = allocation
    .filter(({ percentage }) => percentage > 0)
    .map(({ category, percentage }) => ({
      amount: (monthlyAmount * percentage) / 100,
      description: description || '',
      category,
      month: selectedMonth,
      year
    }));

  if (insertions.length === 0) {
    res.status(400).json({ error: 'No valid entries to create' });
    return;
  }

  // Insert all entries in a single transaction
  const insert = db.prepare(
    'INSERT INTO savings (amount, description, category, month, year) VALUES (?, ?, ?, ?, ?)'
  );
  const insertAll = db.transaction((rows) =>
    rows.map((row) => ({
      id: insert.run(row.amount, row.description, row.category, row.month, row.year).lastInsertRowid,
      ...row
    }))
  );
  const results = insertAll(insertions);

  res.json({
    message: `Successfully created ${results.length} savings entries for ${selectedMonth} ${year}`,
    entries: results,
    summary: {
      monthlyAmount,
      selectedMonth,
      year,
      categoriesCreated: {
        ETFs: etfPercentage > 0 ? 1 : 0,
        'Savings Account': savingsPercentage > 0 ? 1 : 0
      }
    }
  });
});

// Delete savings entry
app.delete('/api/savings/:id', (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Stock entries come from the portfolio. Change the stock quantity there instead.' });
    return;
  }
  const info = db.prepare('DELETE FROM savings WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Savings entry not found' });
    return;
  }
  res.json({ message: 'Savings entry deleted successfully' });
});

// Stock Watchlist Routes

// Get all tickers in watchlist
app.get('/api/stocks/watchlist', (req, res) => {
  res.json(db.prepare('SELECT * FROM stock_watchlist ORDER BY added_at DESC').all());
});

// Add ticker to watchlist (fetch initial data and store)
app.post('/api/stocks/watchlist', async (req, res) => {
  const { ticker } = bodyOf(req);

  if (!ticker) {
    res.status(400).json({ error: 'Ticker symbol is required' });
    return;
  }

  // Validate ticker format (1-5 uppercase letters)
  const tickerUpper = String(ticker).toUpperCase().trim();
  if (!/^[A-Z]{1,5}$/.test(tickerUpper)) {
    res.status(400).json({ error: 'Invalid ticker format. Use 1-5 letters only.' });
    return;
  }

  try {
    // Check for duplicate first to avoid unnecessary API calls
    const exists = db.prepare('SELECT 1 FROM stock_watchlist WHERE ticker = ?').get(tickerUpper);
    if (exists) {
      res.status(400).json({ error: 'Ticker already in watchlist' });
      return;
    }

    // Look the ticker up: the profile gives the ISIN used for prices
    const profile = await stockService.getProfile(tickerUpper);
    if (profile.currency && profile.currency !== 'USD') {
      res.status(400).json({ error: `${tickerUpper} (${profile.name || profile.isin}) is priced in ${profile.currency}. Only US-dollar stocks are supported for now.` });
      return;
    }
    const eod = await stockService.getEndOfDay(profile.isin);

    // Add to the watchlist, then store profile, price and dividends
    const id = db.transaction(() => {
      const inserted = db.prepare('INSERT INTO stock_watchlist (ticker) VALUES (?)').run(tickerUpper);
      saveProfile(tickerUpper, profile);
      // A stock that was removed and added again starts fresh (no stale previous close)
      db.prepare('UPDATE stock_quotes SET price_source = NULL, timestamp = NULL, prev_close = NULL, change = 0 WHERE ticker = ?').run(tickerUpper);
      savePrice(tickerUpper, eod);
      return inserted.lastInsertRowid;
    })();

    // Dividends are optional: if they can't be fetched now, the next refresh tries again
    let dividendsLoaded = true;
    try {
      saveDividends(tickerUpper, await stockService.getDividends(profile.isin));
    } catch (error) {
      dividendsLoaded = false;
      console.warn(`⚠️  Added ${tickerUpper} without dividend data (${error.code || error.message}); the next refresh tries again`);
    }

    res.json({
      id,
      ticker: tickerUpper,
      isin: profile.isin,
      companyName: profile.name,
      dividendsLoaded,
      message: `${tickerUpper} (${profile.name || profile.isin}) added to watchlist`
    });
  } catch (error) {
    if ((error.code || error.message) === 'NOT_FOUND') {
      res.status(400).json({ error: 'Invalid ticker symbol. Ticker not found.' });
      return;
    }
    sendStockServiceError(res, error);
  }
});

// Remove ticker from watchlist
app.delete('/api/stocks/watchlist/:ticker', (req, res) => {
  const tickerUpper = req.params.ticker.toUpperCase();

  // Removing a stock you still own would make its savings history disappear
  const holding = db.prepare('SELECT quantity FROM stock_holdings WHERE ticker = ?').get(tickerUpper);
  if (holding && holding.quantity > 0) {
    res.status(409).json({ error: `You still own ${holding.quantity} shares of ${tickerUpper}. Set the quantity to 0 before removing it.` });
    return;
  }

  // Quantity history is kept: past buys and sells remain part of your savings
  const removed = db.transaction(() => {
    const info = db.prepare('DELETE FROM stock_watchlist WHERE ticker = ?').run(tickerUpper);
    db.prepare('DELETE FROM stock_holdings WHERE ticker = ?').run(tickerUpper);
    return info.changes;
  })();

  if (removed === 0) {
    res.status(404).json({ error: 'Ticker not found in watchlist' });
    return;
  }
  res.json({ message: 'Ticker removed from watchlist successfully' });
});

// Get stored quotes for all watchlist tickers
app.get('/api/stocks/quotes', (req, res) => {
  const rows = db.prepare('SELECT * FROM stock_watchlist ORDER BY added_at DESC').all();
  const tickers = rows.map((r) => r.ticker);
  if (tickers.length === 0) {
    res.json([]);
    return;
  }

  const qRows = db
    .prepare(`SELECT * FROM stock_quotes WHERE ticker IN (${tickers.map(() => '?').join(',')})`)
    .all(tickers);
  const quoteByTicker = new Map(qRows.map((r) => [r.ticker, r]));
  const result = tickers.map((t) => {
    const q = quoteByTicker.get(t);
    if (!q) {
      return { ticker: t, price: 0, change: 0, changePercent: 0, volume: 0, timestamp: '', companyName: undefined, dividendYield: undefined, exDividendDate: undefined, lastRefreshedAt: undefined, overviewRefreshedAt: undefined };
    }
    return {
      ticker: q.ticker,
      price: q.price,
      change: q.change,
      changePercent: q.change_percent,
      volume: q.volume,
      timestamp: q.timestamp || '',
      companyName: q.company_name || undefined,
      dividendYield: q.dividend_yield || undefined,
      exDividendDate: q.ex_dividend_date || undefined,
      lastRefreshedAt: q.last_refreshed_at || undefined,
      overviewRefreshedAt: q.overview_refreshed_at || undefined,
    };
  });
  res.json(result);
});

// Refresh all stocks from Eulerpool now (also runs automatically)
app.post('/api/stocks/refresh', async (req, res) => {
  const summary = await refreshAllStocks();
  res.json(summary);
});

// Refresh one stock from Eulerpool now
app.post('/api/stocks/refresh/:ticker', async (req, res) => {
  const tickerUpper = req.params.ticker.toUpperCase();
  if (!db.prepare('SELECT 1 FROM stock_watchlist WHERE ticker = ?').get(tickerUpper)) {
    res.status(404).json({ error: 'Ticker not found in watchlist' });
    return;
  }
  try {
    const result = await refreshStock(tickerUpper, { forceDividends: true });
    res.json({ message: `Refreshed ${tickerUpper}`, ...result });
  } catch (error) {
    sendStockServiceError(res, error);
  }
});

// Data source, refresh interval and remaining Eulerpool quota
app.get('/api/stocks/status', (req, res) => {
  res.json({
    provider: 'Eulerpool',
    prices: 'daily close',
    refreshIntervalHours: STOCK_REFRESH_HOURS,
    quota: stockService.getQuota()
  });
});

// ==================== PORTFOLIO ENDPOINTS ====================

// GET /api/stocks/holdings - Get all holdings
app.get('/api/stocks/holdings', (req, res) => {
  const rows = db.prepare('SELECT * FROM stock_holdings ORDER BY ticker').all();
  res.json(rows.map(row => ({
    ticker: row.ticker,
    quantity: row.quantity,
    updatedAt: row.updated_at
  })));
});

// GET /api/stocks/holdings/:ticker - Get specific holding
app.get('/api/stocks/holdings/:ticker', (req, res) => {
  const row = db.prepare('SELECT * FROM stock_holdings WHERE ticker = ?').get(req.params.ticker.toUpperCase());
  if (!row) {
    res.status(404).json({ error: 'Holding not found' });
    return;
  }
  res.json({
    ticker: row.ticker,
    quantity: row.quantity,
    updatedAt: row.updated_at
  });
});

// PUT /api/stocks/holdings/:ticker - Update quantity (no stock data request)
// Each change is recorded with the current stored price and USD→EUR rate,
// so it can be shown as a Stocks savings entry valued at the time of the change.
app.put('/api/stocks/holdings/:ticker', async (req, res) => {
  const { quantity } = bodyOf(req);
  const tickerUpper = req.params.ticker.toUpperCase();

  // Validate quantity
  if (quantity === undefined || quantity === null) {
    res.status(400).json({ error: 'Quantity is required' });
    return;
  }

  if (!Number.isInteger(quantity)) {
    res.status(400).json({ error: 'Quantity must be a whole number (no decimals)' });
    return;
  }

  if (quantity < 0) {
    res.status(400).json({ error: 'Quantity cannot be negative' });
    return;
  }

  const inWatchlist = db.prepare('SELECT 1 FROM stock_watchlist WHERE ticker = ?').get(tickerUpper);
  if (!inWatchlist) {
    res.status(404).json({ error: 'Ticker not found in watchlist' });
    return;
  }

  // Price and exchange rate at the time of the change (null if not known yet)
  const quote = db.prepare('SELECT price FROM stock_quotes WHERE ticker = ?').get(tickerUpper);
  const priceUsd = quote && quote.price > 0 ? quote.price : null;
  const usdEurRate = await getUsdEurRate();

  // Upsert the holding and log the change (audit trail) in one transaction
  db.transaction(() => {
    const oldRow = db.prepare('SELECT quantity FROM stock_holdings WHERE ticker = ?').get(tickerUpper);
    const oldQuantity = oldRow ? oldRow.quantity : 0;

    db.prepare(
      `INSERT INTO stock_holdings (ticker, quantity, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(ticker) DO UPDATE SET
         quantity = excluded.quantity,
         updated_at = datetime('now')`
    ).run(tickerUpper, quantity);

    if (oldQuantity !== quantity) {
      db.prepare(
        `INSERT INTO stock_quantity_history (ticker, old_quantity, new_quantity, changed_at, price_usd, usd_eur_rate)
         VALUES (?, ?, ?, datetime('now'), ?, ?)`
      ).run(tickerUpper, oldQuantity, quantity, priceUsd, usdEurRate);
    }
  })();

  // Portfolio value is calculated from the cached price in stock_quotes

  res.json({
    ticker: tickerUpper,
    quantity: quantity,
    updatedAt: new Date().toISOString()
  });
});

// GET /api/stocks/portfolio/summary - Get portfolio summary with values
app.get('/api/stocks/portfolio/summary', (req, res) => {
  // Get all holdings with quantities > 0
  const holdings = db.prepare(
    `SELECT h.ticker, h.quantity, h.updated_at,
            q.price, q.change, q.change_percent,
            q.company_name, q.dividend_yield
     FROM stock_holdings h
     JOIN stock_watchlist w ON w.ticker = h.ticker
     LEFT JOIN stock_quotes q ON h.ticker = q.ticker
     WHERE h.quantity > 0
     ORDER BY h.ticker`
  ).all();

  // Calculate portfolio values
  let totalValue = 0;
  let totalChange = 0;

  const holdingsWithValues = holdings.map(row => {
    const currentPrice = row.price || 0;
    const totalStockValue = row.quantity * currentPrice;
    const stockChange = row.quantity * (row.change || 0);

    totalValue += totalStockValue;
    totalChange += stockChange;

    return {
      ticker: row.ticker,
      quantity: row.quantity,
      currentPrice: currentPrice,
      totalValue: totalStockValue,
      change: stockChange,
      changePercent: row.change_percent || 0,
      companyName: row.company_name || undefined,
      dividendYield: row.dividend_yield || undefined
    };
  });

  // Get stock counts
  const stockCounts = db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM stock_holdings h JOIN stock_watchlist w ON w.ticker = h.ticker WHERE h.quantity > 0) as owned,
      (SELECT COUNT(*) FROM stock_watchlist) as total`
  ).get();

  const totalChangePercent = totalValue > 0 ? (totalChange / (totalValue - totalChange)) * 100 : 0;

  res.json({
    totalValue: totalValue,
    totalChange: totalChange,
    totalChangePercent: totalChangePercent,
    stocksOwned: stockCounts.owned || 0,
    // Watched = in the watchlist but not owned (including stocks without a holding yet)
    stocksWatched: (stockCounts.total || 0) - (stockCounts.owned || 0),
    totalStocks: stockCounts.total || 0,
    holdings: holdingsWithValues
  });
});

// GET /api/stocks/watchlist/full - Get watchlist with holdings and quotes
app.get('/api/stocks/watchlist/full', (req, res) => {
  const result = db.prepare(
    `SELECT w.ticker, w.added_at,
            COALESCE(h.quantity, 0) as quantity,
            q.price, q.change, q.change_percent, q.volume, q.timestamp,
            q.company_name, q.dividend_yield, q.ex_dividend_date,
            q.last_refreshed_at, q.overview_refreshed_at, q.isin, q.currency
     FROM stock_watchlist w
     LEFT JOIN stock_holdings h ON w.ticker = h.ticker
     LEFT JOIN stock_quotes q ON w.ticker = q.ticker
     ORDER BY w.ticker`
  ).all();

  res.json(result.map(row => ({
    ticker: row.ticker,
    addedAt: row.added_at,
    quantity: row.quantity,
    price: row.price || 0,
    change: row.change || 0,
    changePercent: row.change_percent || 0,
    volume: row.volume || 0,
    timestamp: row.timestamp || '',
    companyName: row.company_name || undefined,
    dividendYield: row.dividend_yield || undefined,
    exDividendDate: row.ex_dividend_date || undefined,
    lastRefreshedAt: row.last_refreshed_at || undefined,
    overviewRefreshedAt: row.overview_refreshed_at || undefined,
    isin: row.isin || undefined,
    currency: row.currency || undefined
  })));
});

// Errors thrown in any route (e.g. database errors) end up here.
// Keeps the previous JSON error format: { error: message }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(`Error handling ${req.method} ${req.originalUrl}:`, err);
  }
  res.status(status).json({ error: err.message });
});


// Start server only when executed directly
if (require.main === module) {
  app.listen(PORT, HOST, (err) => {
    if (err) {
      console.error('FATAL: Could not start server:', err.message);
      process.exit(1);
    }
    console.log(`Savings Master backend server running on http://${HOST}:${PORT} (this computer only)`);
    // start background schedulers after server starts
    startSchedulers();
  });
}

module.exports = { app };
