# Issue #14 review samples

stores.json contains the six specified branch inputs, derived from the existing step1-listing samples. The previously missing Shoo Loong Kan Manhattan Yelp URL was confirmed in the public page against its name, 22 E 13th St address and telephone. Old Yelp offsets are removed without rewriting historical listing JSON.

Run npm run collect:reviews -- --stores samples/step1-reviews/stores.json. Program-generated restaurant JSON appears here; it must not be hand-edited. Results contain Google and Yelp platform records, at most 200 newest reviews per platform, full original text and explicit missing-data reasons.

Raw Actor responses, review IDs, cache keys, run metadata and detailed costs stay in .local/issue14 and are not public deliverables. The acceptance table records independent page checks, not a restatement of Actor data. All 36 public-page comparisons are recorded in [PAGE_VERIFICATION.md](PAGE_VERIFICATION.md): every sampled rating matches and no text truncation was found. Google source line-break tags have been decoded to displayed newlines; all 36 sampled texts match after the correction. A cache-only replay corrected 113 Google review bodies without changing any other fields or Yelp text. Yelp calendar dates were checked in the restaurant time zone; Google exposes relative dates only, so exact calendar dates remain unverified. Current implementation/test status is tracked in docs/ISSUE14_STATUS.md.

Google samples include 309 rating-only records with empty original bodies and null language. They are retained as source records, not fabricated written reviews. The 1,200 Google records and 925 Yelp reviews total 2,125.

See [delivery and acceptance](../../docs/ISSUE14_DELIVERY.md) for commands, cost, checks and date-verification scope.
