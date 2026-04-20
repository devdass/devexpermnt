# TradeMe Mac Finder — Apple Silicon for Local AI

Ranks TradeMe listings for Apple Silicon Macs (M1 and newer) by value-for-local-AI-inference. A GitHub Action scrapes the TradeMe API every 6 hours, commits JSON data to the repo, and a static GitHub Pages frontend reads those artifacts.

**Target users:** people buying a Mac to run local LLMs. Unified memory size and memory bandwidth matter far more than CPU cores or screen quality.

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Scaffolding and fixtures | ✅ Complete |
| 2 | Extraction and keyword filtering | Pending |
| 3 | Scoring | Pending |
| 4 | TradeMe API client and scraper entrypoint | Pending |
| 5 | Frontend | Pending |
| 6 | GitHub Action | Pending |

## Running tests locally

```bash
node --version  # must be >= 20
npm test
```

Tests use Node's built-in `node --test` runner — no extra dependencies needed.

## Adding a fixture

1. Place the raw TradeMe API JSON response in `scraper/fixtures/api-response-<NN>-<slug>.json`.
2. Place the expected normalized output (or `null` for excluded listings) in `scraper/fixtures/expected-<NN>-<slug>.json`.
   - Use `"__SCRAPED_AT__"` as the placeholder value for `scraped_at` in expected outputs — tests replace it at runtime.
3. Run `npm test` to confirm existing tests still pass.
4. The Phase 2 tests automatically pick up every paired fixture, so no test code changes are needed for new fixtures.

**Fixture naming convention:** `api-response-<NN>-<slug>.json` / `expected-<NN>-<slug>.json` where `<NN>` is zero-padded (01, 02, …) and `<slug>` is a brief kebab-case descriptor.

## Adding a new chip to the bandwidth table

1. Open `scraper/bandwidth-table.js`.
2. Add an entry: `"M5 Pro": <GB/s from Apple spec page>`.
3. Run `npm test` to confirm scoring tests still pass.

## Extending the scoring formula

See `scraper/score.js`. The current formula is:

```
inference_score = (ram_gb * bandwidth_gbs) / price_nzd
```

## Setup for humans (required before Phase 4+)

1. **TradeMe API credentials:** Register at <https://www.trademe.co.nz/developers> and add these four secrets to the GitHub repo (`Settings → Secrets → Actions`):
   - `TRADEME_CONSUMER_KEY`
   - `TRADEME_CONSUMER_SECRET`
   - `TRADEME_OAUTH_TOKEN`
   - `TRADEME_OAUTH_SECRET`
2. **Category ID:** Verify the Apple computers category ID in `scraper/index.js` is correct before the first live run.
3. **GitHub Pages:** Enable Pages on the repo (`Settings → Pages`), set source to the `/site` folder on `main`.
4. **Developer terms:** Confirm this project's use of the TradeMe API complies with their current developer terms before running in production.

## Known limitations

- Only lists Apple Silicon Macs (M1+). Intel Macs are intentionally excluded.
- Prices for auctions in progress may not reflect final sale price.
- RAM/chip detection is regex-based; unusual title formatting may result in `null` fields.
- Storage detection follows the same regex approach and may miss non-standard phrasing.
