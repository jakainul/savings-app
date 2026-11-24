// Look up the ISIN for every watchlist stock that doesn't have one yet,
// using Eulerpool's company profile (1 request per stock).
//   npm run map-isins            preview only (nothing is saved)
//   npm run map-isins -- --save  save the ISINs, names and currencies
//   npm run map-isins -- --all   include stocks that already have an ISIN
const { db, initDatabase } = require('../database');
initDatabase();
const eulerpool = require('../services/eulerpoolService');
const { saveProfile } = require('../services/stockRefresh');

const save = process.argv.includes('--save');
const all = process.argv.includes('--all');

(async () => {
  const rows = db.prepare(
    `SELECT w.ticker, q.isin, q.company_name
     FROM stock_watchlist w LEFT JOIN stock_quotes q ON q.ticker = w.ticker
     ORDER BY w.ticker`
  ).all().filter((r) => all || !r.isin);

  if (rows.length === 0) {
    console.log('All watchlist stocks already have an ISIN.');
    return;
  }

  console.log(`${save ? 'Saving' : 'Preview of'} ISINs for ${rows.length} stocks:\n`);
  console.log('TICKER  ISIN          CURRENCY  NAME (was)');
  let warnings = 0;
  for (const row of rows) {
    try {
      const profile = await eulerpool.getProfile(row.ticker);
      const nameChanged = row.company_name && profile.name && row.company_name !== profile.name ? `  (was: ${row.company_name})` : '';
      const flag = profile.currency !== 'USD' ? '  ⚠️  not USD' : '';
      if (flag) warnings++;
      console.log(`${row.ticker.padEnd(7)} ${profile.isin.padEnd(13)} ${String(profile.currency).padEnd(9)} ${profile.name}${nameChanged}${flag}`);
      if (save) saveProfile(row.ticker, profile);
    } catch (err) {
      warnings++;
      console.log(`${row.ticker.padEnd(7)} ❌ ${err.code || err.message}`);
      if (err.code === 'QUOTA_EXCEEDED' || err.code === 'API_KEY_INVALID' || err.code === 'API_KEY_NOT_CONFIGURED') break;
    }
  }

  console.log('');
  if (warnings) console.log(`⚠️  ${warnings} stock(s) need a look (see above).`);
  console.log(save ? '✅ Saved.' : 'Nothing saved. Check the list, then run: npm run map-isins -- --save');
})().finally(() => db.close());
