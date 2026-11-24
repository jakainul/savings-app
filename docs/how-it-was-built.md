# How it was built

Savings Master was built in two rounds, almost entirely by AI coding agents.
My role was the one I'd have in a team: set the intent, define what "done"
means, review, and decide what ships.

This public repo starts from a clean snapshot. The original repo is private
because its history contains my own financial data. The numbers below come
from that history.

## Round 1: September–October 2025, Cursor Agent

- About 55 pull requests in one month. Each came from a Cursor background
  agent working on one task, and I merged each one after review.
- Built the core: savings entries, the stock watchlist, the portfolio with
  quantities, the allocation chart and the dividend-income projection with
  reinvestment.
- The agents also left a status note for nearly every fix, about 70 markdown
  files in all. Dividend yield calculations took several follow-up pull
  requests (numbers 51 to 55 in the original repo) and a data migration
  to get right.

## Round 2: October 2026, Claude

I moved the code to a fresh repo and changed how I worked with the agent:

- **A review before any change.** A code review came first and produced
  numbered findings. Later commits refer to these findings
  ("review items 1, 2, 3"), so each change traces back to a reason.
- **Small, scoped pull requests.** Seven pull requests, each with one
  purpose: dependency upgrades, removing salaries, stocks derived from the
  portfolio, layout, bug fixes and access lockdown, the API retry fix, and
  the data-provider switch.
- **Tests outside production data.** Each change was tested against a copy of
  the database, with the external APIs stubbed. The real data and the live
  quota were never used for testing.
- **Backups before schema changes,** and migrations that record themselves in
  `schema_migrations`, so they run exactly once.
- **Manual check last.** I ran every change on my Mac before merging.

What changed in round 2:

| Area | Change |
| --- | --- |
| Stack | Create React App → Vite; React 19; Express 4 → 5; sqlite3 → better-sqlite3; dotenv, nodemon and body-parser replaced by Node built-ins |
| Security | Backend listens on 127.0.0.1 only, rejects other host names (DNS rebinding), no CORS; the frontend reaches it through the Vite proxy |
| Data model | Salaries removed; Stocks savings derived from portfolio quantity changes, valued at the price and USD→EUR rate of the day |
| Stock data | Alpha Vantage (25 calls a day) → Eulerpool (100,000 requests a month), prices by ISIN |
| Correctness | Forward dividend yield; marker for out-of-date closes; quota handling that stops instead of retrying |

## The retry loop, in detail

Alpha Vantage's free plan allowed 25 calls a day. A fix for rate-limit
messages treated any unrecognised reply as a short-term limit and retried it
every minute without a cap. One failing company-data request used up the
whole day's budget.

The agent's first fix counted every call against the daily budget. The
second only retried clear "slow down" replies, at most twice. After the
switch to Eulerpool, the rule became simpler: a used-up quota or a rejected
key stops the whole refresh and pauses calls until the reset.
`backend/test/quota.test.js` keeps that rule in place.

## This repo

The public repo started with three pull requests, made the same way:

1. Demo mode with made-up data, so anyone can run the app without an API key.
2. Backend tests and CI, so the checks I used to run by hand now run on
   every pull request.
3. This README and the build notes.
