// Show the last-known Eulerpool request quota (makes no request).
const { db, initDatabase } = require('../database');
initDatabase();
const { getQuota } = require('../services/eulerpoolService');

const quota = getQuota();
if (!quota) {
  console.log('No Eulerpool requests recorded yet. Start the app (or run npm run map-isins) first.');
} else {
  const used = quota.limit != null ? quota.limit - quota.remaining : null;
  console.log('Eulerpool request quota');
  console.log(`  Remaining this month: ${quota.remaining.toLocaleString()}${quota.limit != null ? ` of ${quota.limit.toLocaleString()} (${used.toLocaleString()} used)` : ''}`);
  if (quota.resetsAt) console.log(`  Resets:               ${new Date(quota.resetsAt).toLocaleString()}`);
  console.log(`  As of:                ${quota.updatedAt} UTC`);
}
db.close();
