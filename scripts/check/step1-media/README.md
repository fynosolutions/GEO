# Media collection scripts

Scripts are stored in `scripts/check/step1-media/`. Outputs are stored in `samples/step1-media/`.

Requirements: Node >=24.14, `npm ci` at repository root. Secrets stay in root `.env`; never commit it.

```sh
cd scripts/check/step1-media
node generate.mjs
```

This builds the adapters and collects the configured `samples/step1-media/urls.json` into `samples/step1-media/current/`. Exit 2 means partial coverage. Historical #15 output at `samples/step1-media/articles.json` is preserved until final delivery. Approved Reddit credentials are described in `docs/REDDIT_API_SETUP.md`.

## Apify candidate

Actor: `trudax/reddit-scraper-lite`, direct-post HTML mode, no Reddit cookie, proxy or search. This is an alternative candidate, not official API acceptance. It may be blocked or return partial replies. Do not use account cookies or proxies to bypass a denial. `APIFY_TOKEN` is the only credential used by this script.

```sh
node apify.mjs          # free plan, no Actor starts
node apify.mjs --live   # two explicit launches, <=$0.25 each, reserved <=$0.50
node apify.mjs --resume # observe/download the SAME runs, no new paid starts
node generate.mjs --offline-html --apify-candidate
node --test apify.test.mjs
```

`--live` is guarded against repeats, including ambiguous launch failures. Local state and exact cost/run metadata remain private at `.local/issue20/apify-candidate/`. All reservations count against the Issue #20 $2 ceiling; a launch is never automatically retried. If a run ID is missing after a network failure, reconcile the account manually before doing anything else. If a local lock remains after interruption, verify no other process is active before removing it. A fee cap can truncate results; the output never asserts full reply coverage.

Candidate outputs: `samples/step1-media/candidate-apify/{articles,evidence,acceptance,reddit-review-template}.json`. Combined media output: `samples/step1-media/candidate-all/articles.json`. These files never replace the historical samples or claim official API verification. Exact comment URLs and original text are validated; no authors or account profiles are exported. Automatic name matching can miss unknown names; the review template must be checked before making completeness claims.

`--offline-html` reuses prior HTML captures and can fetch official Reddit if approved credentials have since been configured. Candidate merging itself starts no Actors. Fresh HTTP collection does not require local HTML, but saved captures are required for offline HTML mode. Candidate public comments and templates must be refreshed/removed in accordance with the approved retention and deletion conditions before any sharing. No automatic publication is performed.

The live HTML response can omit parent IDs; those comments are retained with unknown parent metadata instead of inventing tree relationships. The current two captures contain 25 comments each versus declared counts 27 and 47, so both remain partial. All 50 retrieved comment bodies were reviewed using exact original-text spans; 63 restaurant mentions were exported. The review file is private at `.local/issue20/apify-candidate/mentions-reviewed.json` and is applied only when its content fingerprint matches. Neither this review nor successful Actor completion proves missing replies were fetched. The combined output rejects candidate captures older than 24 hours.

## Default output and manual exceptions

The default `node generate.mjs` writes the Issue #20 result to `samples/step1-media/articles.json` and sidecars. This replaces the previous result at that path, so use `node generate.mjs --out samples/step1-media/current` while preserving historical #15 files during development. `--urls FILE` changes the URL manifest without code changes. `node verify.mjs` checks the default result; pass an output directory to check another location.

From repository root on a new checkout, the command is:

```sh
npm ci && node scripts/check/step1-media/generate.mjs
```

Node >=24.14 and npm are required. Exit 2 means outputs were produced with explicitly partial coverage; exit 1 is a setup or execution error. No Apify Actor starts automatically. Missing Reddit approval/credentials leaves those sources unavailable. Fresh HTTP sources require network access but no local cache. Setup does not require Chrome for this HTTP entry.

The `manual/manifest.json` records each blocked-source URL and access evidence. Useful user-saved pages are imported with `manual.mjs`; see `samples/step1-media/manual/README.md`. Hash, exact URL and save-time checks prevent a different page or a challenge response from being used as article text. Direct success always takes precedence over a manual archive. Pending archives remain explicit missing content, not empty-source claims.
