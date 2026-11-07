# Restaurant JSON Collector

Input a restaurant list to collect every store and produce **one JSON file per restaurant** under `out/batches/<batch-id>/<restaurant-name>.json`. Each file uses the same array format as single-store collection and contains ten platform records by default. Single-store debugging still produces `out/<restaurant-name>.json`. The website is a local visualization and test interface over the same collector. This branch uses Node.js HTTP, TypeScript and Playwright. Detection, optimization and reporting are not implemented.

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

## Restaurant list → one file per restaurant

Create a JSON list (for example `my-stores.json`; do not overwrite an existing weekly store configuration):

```json
[
  {"id":"easy-joy","name":"Easy Joy Dim Sum & AYCE Hot Pot","address":"145 Mulberry St, New York, NY 10013"},
  {"id":"frydom","name":"Frydom Express","address":"781 61st St, Brooklyn, NY 11220"}
]
```

```sh
npm run collect -- --stores my-stores.json
npm run collect -- --stores my-stores.json --platforms yelp,instagram
```

The CLI prints one generated restaurant file path per input store. Six stores produce exactly six JSON files; each contains an array of ten platform records by default, with exactly the same keys and structure as single-store output. No store_id/input metadata or batch wrapper is inserted into these files. Selecting fewer platforms still limits the records to those platforms; Google resolves identity internally. The filename uses Google's resolved restaurant name, with an id suffix for same-name/case-insensitive collisions; unresolved/cancelled stores retain their input name or place ID as the filename. Input/status/output-path metadata remains in the local job state rather than the exported records.

Lists accept 1–20 restaurants. Supply either name or place_id per row, with optional address and unique id; omitted ids are assigned in input order. Same-name branches use separate ids. Text files may instead contain one `name | full address` per line. The complete list is validated before collection, then stores run sequentially. One store failure does not prevent the next. Ctrl+C cancels active Apify work and leaves completed results and explicit cancellation records in the unstarted stores' files. Each run has a separate directory. Consume files after the CLI exits or the web job reaches a terminal status; in-progress files contain explicit pending records. Exit 2 means one or more stores failed; 130 means cancelled. Per-Actor budgets are not a total batch budget.

In the website select **Restaurant list**, upload a .json/.txt file or paste the list, choose platforms and collect. Results show list progress, a store preview selector and a download link for each restaurant. **Stop collection** stops the entire batch. Batch mode currently collects basic listing information; optional menu collection remains in single-store mode. Failure reasons are short English sentences such as `No matching public listing was found.`; full provider details remain in diagnostics.

## Local test UI

```sh
npm start
```

Windows users can double-click `Start-GEO.bat`. It discovers Node.js on PATH (or uses `GEO_NODE`), and also supports the existing local `E:\CondaEnvs\geo` environment and the bundled Codex runtime when Explorer has no Node on PATH. It installs missing dependencies with npm, builds the application, then starts the server (browser installation is not needed for the current Apify-only mode). It does not overwrite `.env`. Use `Start-GEO.bat --check` to build and run tests without live Apify collection, or `--build-only` to validate compilation only. On an error, double-click startup keeps the window open. Keep the server window open while using the UI.

Open the printed address, choose name or place ID, choose the platforms to test, collect, and download the actual generated file. A website pasted into the name input is resolved through Apify to a restaurant name. The default host is `127.0.0.1`; no login setup is required. The existing optional `GEO_API_TOKEN` gate protects remote access. Non-loopback binding without a token is rejected. Cloud batch runs can use the CLI directly with persistent output storage.

## Data and adapters

The single file is a JSON array with ten platform records by default. The eight original platforms (Google Maps, Yelp, Tripadvisor, OpenTable, DoorDash, Uber Eats, Grubhub and Facebook) retain rating/review_count. Resy and Instagram form a separate provisional category with followers/posts instead of rating/review_count. The eight listing platforms include rating_raw with original rating and review count together (separate source fields are combined as average/count without value conversion); Resy and Instagram omit it; rating_value and review_count_value are not added. Explicit Facebook Not yet rated text becomes numeric 0; other source ratings are unchanged. Only selected platforms are emitted; selected but missing platforms remain present. See [the data contract](docs/API_CONTRACTS.md) for category-specific fields, unknown values, matching and errors.

Collection currently uses Apify only; browser is temporarily disabled even if an old environment setting enables it. Apify Google Search discovers platform URLs, then the platform Actors retrieve their own data. Missing links can fall back to configured native Actor search; Yelp and Instagram require observed listing/profile URLs. Google resolves the target; other platforms must match at least two identity facts. Source values are retained except the explicit Facebook conversion above. The UI renders separate category tables as readable lists without JSON syntax. Stop collection cancels the current job and requests abortion of its active Apify runs, retaining completed results. No cross-platform backfilling occurs.

Facebook adapters and schema verification: [APIFY_SETUP.md](docs/APIFY_SETUP.md). Raw responses, jobs, browser observations and screenshots stay in ignored `.local/` directories. They are diagnostics, not the downstream interface. `APIFY_MAX_CHARGE_USD` limits each Actor run rather than the whole job. Missing fields, subscription requirements or access restrictions can produce partial results.

## Verification and delivery

```sh
npm run check
npm run build
npm test
```

Read [AGENTS.md](AGENTS.md), [COLLABORATION.md](COLLABORATION.md), [development rules](docs/DEVELOPMENT_RULES.md), and the [issue #1 delivery checklist](docs/ISSUE1.md). Current delivery baseline is `main`, per the user's 2026-11-06 instruction; the former codex integration branch is historical. Fixture tests do not establish macOS or live-page acceptance.

Directory responsibilities: [backend](backend/README.md), [frontend](frontend/README.md), [scripts](scripts/README.md), [config](config/README.md), [docs](docs/README.md). The pre-existing `docs/ISSUE_2_HANDOFF.md` is historical, not current collector instructions.

For single-platform debugging: `npm run collect -- --name "Restaurant" --address "123 Main St, City" --platforms yelp`. Google Maps always resolves identity internally, but appears in the JSON only if selected. An explicit empty selection is rejected. Failed identity matching emits matched:false and no other business data. See docs/ISSUE3.md for delivery notes and test evidence.

## Weekly history (issue #5)

Batch collection, immutable snapshots and week-over-week reports are available via `npm run collect:weekly`. Configure `stores.json` first; its empty default prevents accidental paid collection. See [weekly module and deployment instructions](backend/weekly/README.md). The GitHub Actions workflow is prepared but disabled until `GEO_WEEKLY_ENABLED=true` is configured after integration. Menu-date comparison accepts a documented sidecar; the #4 producer adapter and cloud/two-week acceptance remain pending.

## Menus, prices and hours (issue #4)

`npm run collect:details -- --stores stores.json --store STORE_ID` produces independent channel/menu/price/hours files. See [menu audit](backend/menu-audit/README.md) for source verification, OCR configuration, output and current acceptance limits. Live runs use Apify discovery; offline tests do not establish real seven-channel coverage.
