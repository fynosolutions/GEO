# Restaurant JSON Collector

Input a restaurant name or Google place ID; the receiving system reads **`out/<restaurant-name>.json`**. The website is a local visualization and test interface over the same collector. This branch uses Node.js HTTP, TypeScript and Playwright. Detection, optimization and reporting are not implemented.

## Install and run (macOS / Linux / Windows)

Install Node.js **24.14+** with npm. From the repository root:

```sh
npm ci
npx playwright install chromium
cp .env.example .env
```

Windows: use `Copy-Item .env.example .env`. Preserve any existing `.env`. Linux servers: `npx playwright install --with-deps chromium`. No Conda, Python, Edge, Windows registry access or machine-specific launcher is required.

Set `APIFY_TOKEN` in `.env`, then:

```sh
npm run build
npm run collect -- --name "Restaurant Name" --address "123 Main St, City, NY 10001"
npm run collect -- --place-id "ChIJ..."
```

The CLI prints the file path. Exit 0: at least one listing found; 2: file produced but no listing found; 1: invalid input, unresolved place ID or fatal failure. Inspect every platform's `found` and `error`, even after exit 0.

The resolved Google restaurant name determines the filename, including when a website is pasted into the name input. Invalid filename characters are replaced. Ambiguous Google matches require a fuller address or place ID. An unresolved place ID produces an explicit error and diagnostics rather than an invented restaurant filename. Repeated runs replace the same output file atomically.

## Local test UI

```sh
npm start
```

Windows users can double-click `Start-GEO.bat`. It discovers Node.js on PATH (or uses `GEO_NODE`), and also supports the existing local `E:\CondaEnvs\geo` environment and the bundled Codex runtime when Explorer has no Node on PATH. It installs missing dependencies with npm, builds the application, then starts the server (browser installation is not needed for the current Apify-only mode). It does not overwrite `.env`. Use `Start-GEO.bat --check` to build and run tests without live Apify collection, or `--build-only` to validate compilation only. On an error, double-click startup keeps the window open. Keep the server window open while using the UI.

Open the printed address, choose name or place ID, choose the platforms to test, collect, and download the actual generated file. A website pasted into the name input is resolved through Apify to a restaurant name. The default host is `127.0.0.1`; no login setup is required. The existing optional `GEO_API_TOKEN` gate protects remote access. Non-loopback binding without a token is rejected. Cloud batch runs can use the CLI directly with persistent output storage.

## Data and adapters

The single file is a JSON array with eight platform records: Google Maps, Yelp, Tripadvisor, OpenTable, DoorDash, Uber Eats, Grubhub and Facebook. By default all eight are included. The current user-requested revision adds matched to issue #1's original twelve fields. Only selected platforms are emitted; selected but missing platforms remain present. See [the data contract](docs/API_CONTRACTS.md) for types, unknown values, matching and errors.

Collection currently uses Apify only; browser is temporarily disabled even if an old environment setting enables it. Apify Google Search discovers platform URLs, then the platform Actors retrieve their own data. Missing links can fall back to native Actor search. Google resolves the target; other platforms must match at least two identity facts. Only source field names are mapped: addresses, phone numbers, hours, ratings, prices and counts keep their original JSON values and types. Private matching normalization is never exported. The UI renders these original structures as readable lists without JSON syntax. No cross-platform backfilling occurs.

Facebook adapters and schema verification: [APIFY_SETUP.md](docs/APIFY_SETUP.md). Raw responses, jobs, browser observations and screenshots stay in ignored `.local/` directories. They are diagnostics, not the downstream interface. `APIFY_MAX_CHARGE_USD` limits each Actor run rather than the whole job. Missing fields, subscription requirements or access restrictions can produce partial results.

## Verification and delivery

```sh
npm run check
npm run build
npm test
```

Read [AGENTS.md](AGENTS.md), [COLLABORATION.md](COLLABORATION.md), [development rules](docs/DEVELOPMENT_RULES.md), and the [issue #1 delivery checklist](docs/ISSUE1.md). The implementation is developed on `issue1_fix` and delivered to `codex/geo-audit-apify-20261101` as requested; the repository default `main` is a separate branch. Fixture tests do not establish macOS or live-page acceptance.

Directory responsibilities: [backend](backend/README.md), [frontend](frontend/README.md), [scripts](scripts/README.md), [config](config/README.md), [docs](docs/README.md). The pre-existing `docs/ISSUE_2_HANDOFF.md` is historical, not current collector instructions.

For single-platform debugging: `npm run collect -- --name "Restaurant" --address "123 Main St, City" --platforms yelp`. Google Maps always resolves identity internally, but appears in the JSON only if selected. An explicit empty selection is rejected. Failed identity matching emits matched:false and no other business data. See docs/ISSUE3.md for delivery notes and test evidence.

## Weekly history (issue #5)

Batch collection, immutable snapshots and week-over-week reports are available via `npm run collect:weekly`. Configure `stores.json` first; its empty default prevents accidental paid collection. See [weekly module and deployment instructions](backend/weekly/README.md). The GitHub Actions workflow is prepared but disabled until `GEO_WEEKLY_ENABLED=true` is configured after integration. Menu-date comparison accepts a documented sidecar; the #4 producer adapter and cloud/two-week acceptance remain pending.

## Menus, prices and hours (issue #4)

`npm run collect:details -- --stores stores.json --store STORE_ID` produces independent channel/menu/price/hours files. See [menu audit](backend/menu-audit/README.md) for source verification, OCR configuration, output and current acceptance limits. Live runs use Apify discovery; offline tests do not establish real seven-channel coverage.
