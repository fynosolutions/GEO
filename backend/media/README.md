# Media list collector — Issue #15

`public.ts` exposes the nine-source manifest, article/evidence types, DOM/index parsers and six-branch membership table. `indexed.ts` is a labelled fallback, `saved.ts` handles user-provided saved pages, `texts.ts` imports supplied paragraphs, and `acceptance.ts` checks data completeness. No Apify, merchant database, UI or weekly workflow is added.

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
npm run collect:media -- --out .local/issue15/replay
npm run collect:media -- --fetch-missing --out .local/issue15/fresh
npm run collect:media -- --source eater-hot-pot --refresh --out .local/issue15/refreshed
npm run collect:media -- --supplied-pages .local/issue15/user-supplied --out samples/step1-media
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

Infatuation guide descriptions come only from saved venue-description paragraphs; names/ranks/addresses/counts still pass the normal page parser. Wording and paragraph order are preserved. Reddit validates post identity, unique comment IDs, declared/saved counts, readable/deleted nodes and a hash-bound review of restaurant spellings. Nested reply bodies are assigned only to their own comment. Ads and sidebar text are excluded. Deleted text is not recovered. Reddit rank means first mention order in the saved Best-sort thread, not editorial rank. Coverage is scoped to the saved capture, not future comments. Known-source restaurant spellings must be reviewed again for a changed thread before setting the review flag/hash.

The delivered Reddit file has 47 unique comment nodes: 46 readable, one with a deletion marker. It contains 12 distinct restaurant mentions; all 46 readable comments were reviewed for additional restaurant names. No full branch address is inferred from a neighbourhood hint.

For individual user-supplied paragraphs, `--supplied-texts FILE` accepts an array of article URL plus exact restaurant name/rank/non-empty blurb. Unknown, duplicate, blank or conflicting rows are rejected before output replacement. Whitespace is retained and evidence records paragraph SHA-256. This option does not manufacture source verification.

## Output and acceptance

Generated files: `articles.json`, `上榜表.md`, `evidence.json`, `acceptance.json`, `验收报告.md`, `supplied-texts.template.json`, `cache-manifest.json`. The article/restaurant schema exactly follows #15; all provenance/quality metadata lives in companions. Counts use distinct source URLs and confirmed name/street matches. Editorial lists, directories, other branches and community mentions remain separate.

The final samples have 9 sources, 105 entries, 22 descriptions and 83 null descriptions. Ten introductions came from the user-saved Infatuation hot-pot guide; twelve comment excerpts came from the user-saved Reddit thread. Other full media descriptions are not reproduced in this export; no summaries are substituted as original text. Missing dates/addresses and date conflicts stay null with reasons. Michelin's introductory count discrepancy is recorded.

Exit 0 / `complete:true` means the selected source data is fully populated and verified. Exit 2 means partial; exit 1 means invalid input/fatal failure. `ready_for_delivery` is the stricter full-data signal requiring all sources and descriptions. It remains false for this delivery. Issue #15 explicitly permits nulls and delivery with stated gaps, so the submission reports the 83 missing descriptions for mentor review rather than claiming full-data acceptance.
