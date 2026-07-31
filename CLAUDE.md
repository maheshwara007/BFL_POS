# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all API tests
npm run test:api

# Run a specific spec file
npm run test:api -- --testPathPatterns='exchange-sale'
npm run test:api -- --testPathPatterns='pos-normal'
npm run test:api -- --testPathPatterns='tier-accrual'

# Run with verbose output
npm run test:api:verbose

# Named suite shortcuts (from package.json)
npm run test:api:apple-wallet
npm run test:api:pos          # matches pos-* files
npm run test:api:web          # matches web-* files
npm run test:api:guest
npm run test:api:negative

# Run a single test by name
npm run test:api -- --testNamePattern='EXL-TC-001'
```

## Architecture

**Test runner:** Jest + ts-jest, `maxWorkers: 1` — all specs run serially. Config is `jest.config.ts`. Tests live in `tests/api/` only.

**Global setup / teardown flow:**
1. `jest.global-setup.ts` runs once before all specs. It fetches a bearer token from `/rprest/api/transaction/v1/token` (credentials from `.env.test`) and writes it to `.jest-token.tmp`.
2. It then auto-provisions 6 fresh member accounts (POS Explorer/Hunter/Champion + WEB Explorer/Hunter/Champion) by calling the registration and commit APIs, and writes their mobile numbers to `.jest-tier-accounts.tmp`.
3. `helpers.ts` reads both `.tmp` files at import time — tier mobiles take priority over `.env.test` fallbacks.
4. `jest.global-teardown.ts` deletes `.jest-token.tmp` after the run.

**Environment config:** All tests read from `.env.test` (not `.env`). The key values are `BASE_URL`, `STORE_ID`, `API_USERNAME`, `API_PASSWORD`. Never read `process.env` directly in spec files — use the exports from `helpers.ts`.

**Core helpers (`tests/api/helpers.ts`):**
- `post(path, body, token?)` — base HTTP client for all API calls
- `getToken()` — reads the bearer token from `.jest-token.tmp`
- `isMember(token, mobile, channel)` — calls `/isMember` and returns a typed `MemberCtx` (memberId, points, pointsValue, tier, etc.)
- `commitBody(opts)` / `defaultItem(lineNo, overrides)` — builders for commit transaction payloads
- `computeBillDetails(items, id)` — derives `billDetails` from an items array (subTotal, VAT, totals)
- `rnd()`, `now()` — unique receipt IDs and timestamps

**Test data (`tests/api/test-data.ts`):**
- `EARN_RATES` — Explorer=1, Hunter=2, Champion=3 pts per AED
- `calcExpectedEarn(netPrice, vatAmount, tier)` — formula: `Math.floor((netPrice + vatAmount) × rate)`
- `TENDER` — tender code constants: T1=Cash, T8=Points, TW01=Wallet, T32=Credit Note
- `makeItem(opts)` — typed item builder; use over raw objects in new tests
- `TD` — pre-defined numeric scenarios keyed by test ID (e.g. `TD.EXL_SINGLE_RETURN`)

**API report logger (`tests/api/api-report-logger.ts`):**
- Call `initApiLog()` in `beforeAll` to prepare the log file without resetting it
- Call `appendApiLog({ testName, endpoint, httpStatus, request, response })` after each API call
- Call `generateApiHtmlReport()` in `afterAll` to write `reports/exchange-sale-api-report.html`
- `jest.global-setup.ts` calls `clearApiLog()` once per full run so all specs accumulate into one combined report

**Spec file naming convention:**

| Pattern | Channel / Domain |
|---|---|
| `pos-*.spec.ts` | POS channel (Indian mobile `91xxxxxxxxxx`) |
| `web-*.spec.ts` | WEB channel (UAE mobile `971xxxxxxxxx`) |
| `exchange-sale.spec.ts` | POS exchange/return flow |
| `exchange-sale-web.spec.ts` | WEB exchange/return flow |
| `tier-accrual.spec.ts` | Points earn by tier |
| `redemption-validation.spec.ts` | Block/unblock/redeem (T8, TW01) |
| `return-reversal.spec.ts` | Return-triggered points reversal |
| `accrual-validation.spec.ts` | Earn rate and threshold validation |
| `negative.spec.ts` / `edge-cases.spec.ts` | Error paths and boundary conditions |

**Key API endpoints (all POST to `BASE_URL`):**

| Endpoint | Purpose |
|---|---|
| `/rprest/api/transaction/v1/token` | Fetch bearer token |
| `/rprest/api/transaction/v1/isMember` | Member lookup — returns memberId, points, tier |
| `/rprest/api/transaction/v1/profile` | Register / update member |
| `/rprest/api/transaction/v1/send/otp` | Send OTP (POS registration; UAT bypass OTP = `1111`) |
| `/rprest/api/transaction/v1/commitTransaction` | Commit a purchase/return/exchange |
| `/rprest/api/transaction/v1/blockPoints` | Block points or wallet before redemption |
| `/rprest/api/transaction/v1/unblockPoints` | Unblock if redemption cancelled |
| `/rprest/api/transaction/v1/exchangeLine` | First step of exchange sale — validate return items |

**Tier thresholds (used in globalSetup):**
- Explorer → Hunter: single POS commit of AED 4001 net
- Hunter → Champion: subsequent commit of AED 8002 net

**Known API behaviours:**
- Negative quantity in `exchangeLine` returns HTTP 200 with `status=null` instead of 400 — flagged via `console.warn` in tests
- Wrong `previousLineNo` in commit is not validated by the API (returns 200 Success) — EXC-TC-007B and WEB-EXC-TC-007B assert `not.toBe(200)` per doc §3.3.1, so these tests will FAIL until the API enforces the validation
- Tier upgrade (Explorer→Hunter at AED 4001 net, Hunter→Champion at AED 8002 net) does not fire on Exchange Sale (mixed isReturn Yes/No) commits, even when the new (isReturn:No) item's net spend crosses the threshold — points still accrue correctly on that item, only the tier-upgrade evaluation is skipped. Plain new-only purchases at the same net spend upgrade correctly (this is how `jest.global-setup.ts` provisions Hunter/Champion test accounts every run). EXC-TC-024 asserts the correct expected behaviour, so it will FAIL until the tier engine also evaluates Exchange Sale commits.
- Store-level currency (`ONLINE_AE`=AED, `ONLINE_IN`=USD, `ONLINE_SA`=SAR, `ONLINE_SG`=SGD, `ONLINE_KW`=KWD) each has its own independent earn-rate multiplier in `commitTransaction` — unrelated to the AED-base currency-conversion master table in Configurations → Currency Conversion (e.g. `ONLINE_IN` earns 3.33x though its AED→USD rate is 0.27). See `currency-conversion.spec.ts`.

## Reports

HTML reports are written to `reports/`:
- `reports/bfl-api-report.html` — jest-html-reporter summary (all specs)
- `reports/exchange-sale-api-report.html` — per-call request/response log (exchange sale specs)
- `reports/exchange-sale-api-log.json` — raw JSON log consumed by the HTML report
