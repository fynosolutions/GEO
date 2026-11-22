# Issue #20 delivery

Scripts are stored in `scripts/check/step1-media/`; outputs are saved in `samples/step1-media/`. Node >=24.14 and npm are required. Run `npm ci && node scripts/check/step1-media/generate.mjs --out samples/step1-media/current`. Partial coverage exits 2 with output saved. `node scripts/check/step1-media/audit-manual.mjs` checks the ten manual sources. The legacy #15 files are preserved in `samples/step1-media/legacy-issue15/`.

The delivered articles contain 37 sources and 284 entries: 221 non-Reddit records plus 63 Reddit mentions. Source timestamps are preserved; this is not a fresh November 22 scrape. Every entry includes closed; Reddit quotes include comment_url. Thirteen AYCE directory cards and 41 Corner list cards have no separate original introduction; null values are explicitly classified as not_provided.

Reddit exception: the applicant received Reddit Data Team's November 21 reply stating public API requests are no longer accepted and apps/bots must register and operate on Developer Platform. The user authorized delivery and closure using the Apify candidate. No claim of official OAuth approval is made. The two captures contain 25/27 and 25/47 comments; 50 bodies were reviewed and produced 63 mentions. Missing replies remain unverified. The official adapter is retained. Accounts, tokens and detailed cost metadata are not delivered.

Direct HTTP handles 25 non-Reddit pages; ten Corner/Michelin sources use user-saved HTML after direct 429/challenge responses. Files and hashes are in manual/. Two Michelin URLs refer to one restaurant and are not distinct businesses. A clean directory on the same Mac passed dependency installation and fresh output generation; a second physical computer has not been tested.

Apify launch commands and limits are documented in the script README. --resume observes existing tasks without paid restarts. --live starts paid tasks and must not be used merely to inspect delivered results. `prepare-delivery.mjs` merges the reviewed historical candidate with current non-Reddit output without changing source dates. Snapshot merging is a disclosure-based handoff, not an official/full-tree acceptance claim.
