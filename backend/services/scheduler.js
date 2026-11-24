// Background jobs:
//   - Stock data from Eulerpool: at startup and every few hours. A new close is
//     saved only when its date changes, so no trading calendar is needed.
//   - USD→EUR exchange rate (ECB via Frankfurter): every 6 hours.
const { refreshAllStocks } = require('./stockRefresh');
const { refreshUsdEurRate } = require('./fxRates');

const STOCK_REFRESH_HOURS = Number(process.env.STOCK_REFRESH_HOURS) > 0 ? Number(process.env.STOCK_REFRESH_HOURS) : 6;
const FX_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 5000;

function startSchedulers() {
  console.log(`\n🚀 Stock data: Eulerpool daily closes, refreshed at startup and every ${STOCK_REFRESH_HOURS} hours\n`);

  setTimeout(() => refreshAllStocks().catch((err) => console.error('Stock refresh failed:', err.message)), STARTUP_DELAY_MS);
  setInterval(
    () => refreshAllStocks().catch((err) => console.error('Stock refresh failed:', err.message)),
    STOCK_REFRESH_HOURS * 60 * 60 * 1000
  );

  // Keep the USD→EUR exchange rate current (used to value stocks in euros)
  refreshUsdEurRate();
  setInterval(refreshUsdEurRate, FX_REFRESH_INTERVAL_MS);
}

module.exports = { startSchedulers, STOCK_REFRESH_HOURS };
