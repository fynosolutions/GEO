# Review collection (issue #14)

Collect the latest public Google and Yelp reviews for explicitly configured branches. This module is separate from listing JSON, menus and weekly scheduling.

## Run

```sh
npm run check
npm run build
npm run collect:reviews -- --stores samples/step1-reviews/stores.json --only store-001 --limit 200
npm run collect:reviews -- --stores samples/step1-reviews/stores.json --limit 200
```

Inputs require unique safe id, name, address, place_id, google_maps_url (with matching query_place_id), and an HTTPS Yelp /biz/ URL. Yelp pagination/search parameters are removed. Google only collects Google-origin reviews, newest first; Yelp's dedicated review Actor is configured without language/date filters. The six-store delivery includes 36 independent page comparisons; Google exact calendar dates are not exposed by the public review view.

Outputs go to samples/step1-reviews/<name>--<id>.json, one array per store with one record per selected platform. Required fields are platform, total_reviews, topics and reviews; url/fetched_at/error record provenance and unavailable facts. Each review is date/rating/text/language. Original wording is never translated, trimmed or truncated. Google source <br> variants are converted to the newlines displayed on the public page; all other characters and Yelp text remain unchanged. Raw provider responses are retained separately. total_reviews is the provider's full business count, not sampled length. Missing language is null with an error explanation. Topics only come from the platform; this module does not generate them. Matching requires source branch identity, not just a repeated input URL.

## Save costs and resume

Use the same --cache directory (default .local/issue14) for the entire task. An exact Actor/input/branch match reuses saved raw results even when parsers change. If a process stops after receiving a run ID, resume reads that existing Actor and dataset instead of starting a replacement. An uncertain start with no ID blocks paid retries. Failed results are preserved too; inspect them before explicitly choosing a different input or cache.

```sh
npm run collect:reviews -- --stores samples/step1-reviews/stores.json --only store-001 --cache-only true
```

Cache-only mode starts no Actors. Raw data, run IDs, completeness checks and billing evidence remain in ignored .local/issue14. Review IDs deduplicate repeated pages; identical text from different reviews is retained. Missing dates/ratings, possible collapsed-text endings, insufficient rows and unknown totals remain explicit. A zero count is different from unavailable reviews.

The task ledger permits at most US$5. --run-cap defaults to US$0.50 and cannot exceed it. Each new run reserves its whole cap before launch; observed settled usage replaces that reservation, while unknown usage keeps the cap reserved. A lock prevents concurrent runs against the same ledger. The Google Actor currently requires a minimum cap of US$0.50; the requested cap is not the expected cost. No automatic paid POST retries occur. Never treat a fresh cache directory as a continuation of the old ledger.

SIGINT/SIGTERM cancels the active provider request and attempts remote termination; completed files remain. Only the selected platforms and stores are attempted. Exit 0 means records have no reported gaps, 2 means partial output, 130 means cancellation, 1 means invalid setup. Code checks and fixture tests do not establish live review completeness or the 36 required page comparisons.
