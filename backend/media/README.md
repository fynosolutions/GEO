# Media collectors — Issue #20 current and Issue #15 history

## Current URL-driven collection — Issue #20 phases 1–3

The default CLI reads `samples/step1-media/urls.json` (37 official inputs). URLs are data, not code constants. `sources.ts` validates the list and derives stable IDs and page types; `live.ts` records bounded HTTP captures, exact status/final URL/time/hash; `layouts.ts` routes by site/layout; `current.ts` isolates each failure and writes evidence. The historical manifest is only `config/media-legacy-sources.json`.

```sh
npm ci
npm run build
npm run collect:media
npm run collect:media -- --offline
npm run collect:media -- --offline-html
npm run collect:media -- --urls /path/to/urls.json --out .local/issue20/custom
npm run verify:media-current
```

Default requests are fresh HTTP, sequential with a per-host interval. Offline mode makes no requests and verifies cached content hashes. Failed fresh requests never fall back to older success/index/manual data. Exact copies of each requested URL remain in the output in input order; redirects are separate evidence. `--cache` defaults to `.local/issue20/pages`, `--out` to `.local/issue20/current`. One-page lists use the same schema and need no code changes. Invalid configuration fails before collection or replacing results.

Outputs: `articles.json` retains the six #15 article keys; current restaurant rows add `closed`, and Reddit quote rows add `comment_url`; `evidence.json`, `access-checks.json`, `acceptance.json`, `description-availability.json`, `input-manifest.json` and `coverage.md` describe access and quality. Page type distinguishes lists, directories, standalone reviews/stories and community threads. `rank` is source order and is not an assertion of editorial ranking on directories or single stories.

Access outcomes separate parsed data, partial/unverified counts, readable parser gaps, HTTP rejection, network failures, storage/cache errors and deferred sources. An HTTP 200 is not by itself a successful extraction. A page without an original directory description retains `blurb:null` with `not_provided`; tags/prices are not fabricated descriptions.

Phase 3 adds `closure.ts` (source-specific closure markers), `reddit.ts` (approved OAuth reads, full accessible reply-tree traversal and 24-hour official snapshots) and `reddit-mentions.ts` (exact original mention spans and quote URLs). `closed=false` means the source did not mark that entry closed, not that the business is open now. Explicit permanently-closed text wins over contradictory embedded booleans; daily opening status and unrelated restaurants are excluded.

Reddit requires approved credentials; missing configuration yields `credentials_missing` with zero anonymous requests. `--offline-html` reuses verified HTML and attempts official Reddit reads; `--offline` makes no requests. The client requests only comments and morechildren, limits each expansion batch to 100 IDs, preserves available partial results and strips deleted/removed bodies and author/account fields. Newly deleted threads remove older snapshots. Expired official snapshots are removed on read and never replaced by old saved HTML.

The mention catalog comes from all current media entries and configured target aliases, not the old fixed thread names. Automatic literal matches may miss unknown names, so tree coverage and semantic mention review are separate. `reddit-review-template.json` lists exact body spans for checking; `--reddit-review FILE` accepts reviewed native comment IDs/spans bound to the current content SHA-256. Unchanged content can reuse review on future fetches; edits/deletions invalidate it. Separate comments retain separate source quotes and permalinks. API Markdown bodies are retained as returned.

See [Reddit setup](../../docs/REDDIT_API_SETUP.md) for the application draft and `npm run reddit:auth -- --start` after approval. The loopback helper saves the refresh token to local `.env` without printing it. It was not started during this implementation, and no application was submitted by the agent.

Current official Reddit live acceptance is pending approval/configuration. `phase3_code_complete` describes implementation; `phase3_complete` additionally needs verified comment-tree and mention coverage. `ready_for_delivery` remains false pending manual exceptions and final clean-machine acceptance. New API request counts are separate from cached capture counts; pricing is marked unknown when requests occur without billing evidence. Historical #15 files are unchanged.


## Historical #15 collector

The following sections and commands apply only to `--legacy` and its nine-source historical evidence.

`public.ts` exposes the nine-source manifest, article/evidence types, DOM/index parsers and six-branch membership table. `indexed.ts` is a labelled fallback, `saved.ts` handles user-provided saved pages, `texts.ts` imports supplied paragraphs, and `acceptance.ts` checks data completeness, and `descriptions.ts` extracts scoped source paragraphs and records per-entry availability. No Apify, merchant database, UI or weekly workflow is added.

## Run and inspect delivered samples

Node 24.14+ and repository dependencies are required. UI tests need a Playwright browser (`npx playwright install chromium`) or an installed Chrome with `BROWSER_CHANNEL=chrome`; the offline sample verifier needs neither.

```sh
npm ci
npm run build
npm run verify:media
BROWSER_CHANNEL=chrome npm test
```

`verify:media` checks the delivered nine records, exact Issue #15 keys, counts, computed acceptance and generated six-branch table without network or private caches. Public JSON outputs are under `samples/step1-media`. HTML bodies, logged-in browser state, personal file paths and source resource folders are not committed.

## Collection and reproduction

```sh
npm run collect:media -- --legacy --out .local/issue15/replay
npm run collect:media -- --legacy --fetch-missing --out .local/issue15/fresh
npm run collect:media -- --legacy --source eater-hot-pot --refresh --out .local/issue15/refreshed
npm run collect:media -- --legacy --descriptions full --supplied-pages .local/issue15/user-supplied --out samples/step1-media
```

Default cache: `.local/issue15/pages`; default output: `.local/issue15/parsed`. A fresh checkout has no original caches; offline replay records missing sources as failed and exits 2. Exact replay of the delivered text requires the original local captures and user-supplied files, identified by SHA-256 in `cache-manifest.json`. New HTTP captures may reflect later website content. `--cache DIR`, `--out DIR`, `--source ID` and `--targets FILE` override inputs/output; six unique target IDs are required.

`--fetch-missing` requests each uncached direct page once. `--refresh` archives existing direct HTML/metadata under cache `previous/` and deliberately refetches once. There are no automatic paid retries. Failed requests retain their actual status/error. No token or Actor is used.

## Source boundaries

Direct caches use `<source-id>.html` and JSON with exact `url`, `fetched_at`, HTTP `status`, optional `final_url`/`error`. Infatuation/Eater visible cards are checked against structured names/order/count. The Infatuation directory excludes guide cards and verifies final pagination. Time Out uses the headline count and consecutive item numbers; absent addresses stay null. Michelin uses restaurant-card selectors and the displayed count, excluding related guides. Its introduction says four while three cards/displayed count agree; this source discrepancy is preserved.

Browser DOM caches use the same pair, with `retrieval:"browser_dom"`, `rendered:true`, actual capture time and `status:null` when HTTP status was not observed. Never invent HTTP 200. Direct/rendered content with validated cards wins over an index fallback.

Index caches use `<source-id>.web.txt` and `.web.json` with exact `url`, `fetched_at`, `retrieval:"web_index"` and `source_age`. Text must be the actual line-numbered tool result starting with the source URL in parentheses. Index completeness is never described as a live capture. There is no challenge bypass or private API access.

## User-provided saved HTML

`--supplied-pages DIR` reads `DIR/manifest.json`, an array such as:

```json
[
  {"source_id":"infatuation-hot-pot","file":"infatuation-hot-pot.html"},
  {"source_id":"reddit-hot-pot","file":"reddit-hot-pot.html","reviewed":true,"reviewed_sha256":"<SHA-256 of the reviewed HTML>"}
]
```

Use simple filenames inside the directory. The Chrome `saved from url` marker must match the configured source. The file modification timestamp records the saved-file time, not an inferred original HTTP fetch time. Evidence is labelled `user_saved_html` with a file hash. The parser never executes HTML scripts or imports browser account/session state into public output.

Saved HTML now supports Infatuation guides and directories, Eater, Time Out and Michelin using their normal source-specific description parser; names/ranks/addresses/counts still pass the normal page parser. Wording and paragraph order are preserved. Reddit validates post identity, unique comment IDs, declared/saved counts, readable/deleted nodes and a hash-bound review of restaurant spellings. Nested reply bodies are assigned only to their own comment. Ads and sidebar text are excluded. Deleted text is not recovered. Reddit rank means first mention order in the saved Best-sort thread, not editorial rank. Coverage is scoped to the saved capture, not future comments. Known-source restaurant spellings must be reviewed again for a changed thread before setting the review flag/hash.

The delivered Reddit file has 47 unique comment nodes: 46 readable, one with a deletion marker. It contains 12 distinct restaurant mentions; all 46 readable comments were reviewed for additional restaurant names. No full branch address is inferred from a neighbourhood hint.

For individual user-supplied paragraphs, `--supplied-texts FILE` accepts an array of article URL plus exact restaurant name/rank/non-empty blurb. Unknown, duplicate, blank or conflicting rows are rejected before output replacement. Whitespace is retained and evidence records paragraph SHA-256. This option does not manufacture source verification.

## Output and acceptance

Generated files: `articles.json`, `上榜表.md`, `evidence.json`, `acceptance.json`, `验收报告.md`, `supplied-texts.template.json`, `cache-manifest.json`. The article/restaurant schema exactly follows #15; all provenance/quality metadata lives in companions. Counts use distinct source URLs and confirmed name/street matches. Editorial lists, directories, other branches and community mentions remain separate.

The current sample replay uses nine user-provided saved pages: 9 sources, 105 entries, 105 original descriptions and zero null descriptions. Paragraph wording and order are retained, including the directory excerpts and Reddit comments. Missing dates/addresses and date conflicts stay null with reasons. Michelin's introductory count discrepancy is recorded. The saved Infatuation dim-sum headline says 11 while its validated restaurant cards/structured list contain 15; all 15 body entries are retained.

Exit 0 / `complete:true` means the selected source meets the implemented coverage and description checks, allowing explicitly explained unknown dates/addresses. Exit 2 means partial; exit 1 means invalid input/fatal failure. `ready_for_delivery` additionally requires all configured sources. Both completeness flags are true for the current supplied-page replay; mentor acceptance remains separate.

## Description export correction — 2026-11-12

The old direct parser assigned `blurb:null` unconditionally, and saved-file import supported only Infatuation guides. This was an export omission, not evidence that websites lacked introductions. Direct parsing now exports recognized restaurant descriptions by default; saved-page import uses the same selectors for all supported media layouts.

`--descriptions full` is the default: extract original wording from the selected local/direct source description containers. `--descriptions supplied-only` inspects cached/direct descriptions without exporting their text; user-provided saved pages and supplementary paragraphs still export normally. Choose the mode for the input material being processed. Unknown mode names fail validation before output replacement.

Boundaries: Infatuation venue description blocks (excluding tags, addresses and ratings), cuisine-directory excerpt paragraphs (excluding guide/author cards), Eater standard card paragraphs, Time Out summary containers and Michelin card descriptions. Inline link text and paragraph order are preserved; buttons, ads, hidden elements, scripts and photo captions are excluded. Missing selectors are `parse_failed` with unknown presence; an empty recognized container is `not_provided`. These are distinct from `not_selected`, where original text was found but excluded by export mode.

`description-availability.json` includes per-entry source/name/rank/presence/reason/selector/character count, without duplicating source paragraphs. Evidence also includes `descriptions` observations. The main article schema is unchanged. `descriptions_missing` means not exported, not necessarily absent on the website.

An initial supplied-only diagnostic found 83 descriptions present but unselected. On 2026-11-12 the user supplied the remaining seven HTML pages. All nine user-provided files now pass source-URL validation; Reddit retains its previously reviewed SHA-256. Full replay exports all 105 descriptions, with zero not_selected, parse_failed, unknown or confirmed-absent rows. Evidence uses each saved file's modification time and content hash. This verifies saved page versions, not fresh HTTP access. Raw HTML and account/session markup remain local.
