// Loads backend/.env into process.env using Node's built-in loader
// (replaces the dotenv package). Safe to require from several modules:
// the file is only read once, and variables already set in the real
// environment are not overridden.
const path = require('path');

const envPath = path.join(__dirname, '.env');

if (!process.env.__BUDGET_MASTER_ENV_LOADED) {
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('⚠️  WARNING: backend/.env not found. Copy .env.example to .env and add your API key.');
    } else {
      throw err;
    }
  }
  process.env.__BUDGET_MASTER_ENV_LOADED = '1';
}
