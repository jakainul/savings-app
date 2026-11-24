// Shared test setup. Require this first in every test file, before any app module:
// it points the app at an in-memory database and a fake API key, and replaces
// fetch so no test can reach a real API or use up a real quota.
process.env.DB_PATH = ':memory:';
process.env.EULERPOOL_API_KEY = 'test-key';

const calls = [];
let routes = [];

// Answer requests whose URL contains `match` with the given status, JSON body and headers.
// Routes are checked in order; a route with `times` is used up after that many calls.
function stubFetch(newRoutes) {
  routes = newRoutes.map((r) => ({ ...r }));
  calls.length = 0;
}

globalThis.fetch = async (url) => {
  calls.push(String(url));
  const route = routes.find((r) => String(url).includes(r.match) && (r.times === undefined || r.times > 0));
  if (!route) {
    throw new Error(`Unexpected request in test: ${url}`);
  }
  if (route.times !== undefined) route.times--;
  return new Response(JSON.stringify(route.body ?? {}), {
    status: route.status ?? 200,
    headers: { 'content-type': 'application/json', ...(route.headers || {}) },
  });
};

// Keep test output readable: the app logs a lot to the console
for (const level of ['log', 'warn', 'error']) {
  console[level] = () => {};
}

module.exports = { stubFetch, calls };
