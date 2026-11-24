// Troubleshooting: call the Eulerpool endpoints the app uses for one stock and
// print status, quota headers and short samples. Never prints the API key.
//   npm run probe-eulerpool -- KO            (ticker)
//   npm run probe-eulerpool -- US1912161007  (ISIN)
// Uses 3 requests.
require('../env');

const KEY = (process.env.EULERPOOL_API_KEY || '').trim();
if (!KEY) {
  console.error('EULERPOOL_API_KEY is missing from backend/.env');
  process.exit(1);
}
const id = (process.argv[2] || 'KO').toUpperCase();
const BASE = 'https://api.eulerpool.com/api/1';
const mask = (text) => String(text).split(KEY).join('***');

(async () => {
  const profile = await probe('Profile', `/equity/profile/${id}`);
  // Prices and dividends by ISIN, as the app requests them
  const isin = profile?.isin || id;
  await probe(`End-of-day close (${isin})`, `/datasets/eod/${isin}`);
  await probe(`Dividends (${isin})`, `/equity/dividends/${isin}`);
  console.log('\nDone.');
})();

async function probe(label, path) {
  console.log(`\n=== ${label}\nGET ${path}`);
  try {
    const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    console.log(`status ${res.status}  remaining=${res.headers.get('x-ratelimit-remaining')}  limit=${res.headers.get('x-ratelimit-limit')}`);
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { console.log('non-JSON:', mask(text.slice(0, 300))); return null; }
    const sample = Array.isArray(body) ? { count: body.length, last: body[body.length - 1] } : body;
    console.log(mask(JSON.stringify(sample)).slice(0, 700));
    return body;
  } catch (err) {
    console.log('request failed:', mask(err.message));
    return null;
  }
}
