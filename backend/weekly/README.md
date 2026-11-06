# Weekly collection (#5)

This module owns batch orchestration, immutable weekly history and comparisons. It consumes the existing collector via `../public.ts`; it does not change #3 matching or #4 menu extraction. `public.ts` contains testable storage/comparison functions; `worker.ts` runs each collector in a separate process; `cli.ts` handles configuration and deadlines.

## Local usage

Fill root `stores.json` (initially empty to prevent accidental paid collection):

```json
[{"id":"my-restaurant-branch","name":"Actual restaurant name","address":"Actual full address","place_id":null,"website":null}]
```

Use a verified place ID when available; otherwise name/address is used. IDs must be unique lowercase slugs and remain stable. Use a new ID when switching branches. No dummy Place IDs are provided.

```sh
npm ci
npm run build
npm run collect:weekly -- --stores stores.json --history .local/history --mode manual
```

Requires APIFY_TOKEN and enabled/configured Actors. The command makes paid API requests. Exit 0 means the batch finished without a completely failed store, not complete platform coverage. Exit 2 means a store failed; results are still saved. Exit 1 means configuration/storage/orchestration failure.

Manual runs use `history/manual/`; scheduled runs use the history root and require a New York Monday. All attempts are archived under runs/<UUID>. Canonical snapshots/<store-id>/<New-York-date>.json and diffs/<date>.md are published once, with weeks/<date>.json as the final completion marker. IDs are filesystem names for stores and disambiguate duplicate restaurant names. Repeated runs archive a new attempt without replacing canonical data. No automatic promotion is implemented; retain a failed weekly observation honestly and inspect retry archives.

A local directory lock prevents overlapping writers. After a process crash, verify no runner is active before removing `.weekly-lock`. Do not edit canonical snapshots. A missing prior week is not replaced with the latest older observation. Manifests record configured identity, revision and configuration hash. Individual store processes receive SIGTERM at their deadline, allowing Actor cancellation, then SIGKILL after 15 seconds. Abrupt machine/runner termination may leave an external Actor running; consult Apify runs. Per-Actor charge caps are not a total job budget.

Comparisons preserve source values, ignore object key order and fetched_at-only differences, distinguish unavailable from absent, and flag >10% changes only for unambiguous scalar numbers/numeric strings. Nested rating structures remain visible but receive no guessed percentage. Menu dates are explicitly pending the #4 contract; they are not inferred from fetch timestamps. Field-level partial errors do not make a listing absent.

## Deferred deployment after coworker merge

The workflow is inert unless repository variable GEO_WEEKLY_ENABLED equals true. No Secrets, remote branch or workflow has been deployed by this implementation. After merging and validating coworker changes:

1. Populate stores.json with two verified stores and configure APIFY_TOKEN in GitHub Secrets; configure optional APIFY_MAX_CHARGE_USD. Check repository Actions write permissions.
2. Merge the tested workflow and collector into the default branch. This implementation checks out the triggering revision; deploy the merged tested code together (no separate collector-ref variable).
3. Enable GEO_WEEKLY_ENABLED and manually dispatch. Inspect manual snapshots, report, manifest, artifact and geo-history branch. Manual results never advance scheduled baselines.
4. Verify Monday 06:00 America/New_York schedule across two real weeks. GitHub can delay/drop schedules; inspect Actions and missing weekly manifests and recover manually without backdating.

History is a dedicated orphan branch in the same repository, with the same visibility as that repository. Only public output is uploaded. Artifacts are recovery copies, not sole retention. No force pushes; a conflicting history push fails visibly. Do not independently edit geo-history while a run is active. The persistence job runs after failed collections to save completed stores. A failed storage operation must be investigated, not treated as an empty baseline.

Offline acceptance: npm run check, npm run build, npm test. Cloud acceptance and two-week observation are not completed by offline tests. #4 menu-date integration remains a separate merge gate.

## Menu-date integration boundary

The optional `--menus <path>` accepts an issue #5 sidecar array, validated before paid calls:

```json
[{"store_id":"my-restaurant-branch","channel":"official","source_url":"https://example.com/menu","menu_date":"2026-10-01","date_source":"on_page"}]
```

Supported provenance: on_page, metadata, upload_date; unknown requires menu_date:null and date_source:unknown. Dates are YYYY-MM-DD. Compare only the same store/channel/source URL across adjacent weeks. Missing observations remain unknown. Sidecars are preserved under menus/<date>.json and each run archive. The comparison implementation is complete and fixture-tested; #4 still needs an adapter from its final schema and the workflow must supply that generated file. This sample is synthetic, not a real menu observation.

## Optional restaurant website

`website` accepts a full HTTP(S) URL or null; omission remains compatible with existing store lists. Input priority is place_id, then website, then name; address is passed in all cases. The website adapter uses the existing collector's website-in-name input: Google must resolve the website association and target address before platform collection. The configured display name remains in manifests/reports. A failed website lookup is recorded as a failure, not silently retried as a different identity. When place_id exists it wins; website is retained as configuration metadata, not an additional verification claim. No official-website record or field is added to the thirteen-field platform output. Website changes alone do not reset store history.

## Upstream synchronization 2026-11-04

Synced remote commit 96e0110 (#3). New collection snapshots require matched:boolean and retain all thirteen fields. Legacy twelve-field history remains readable without adding an inferred matched value. Weekly runs still request the default eight platforms; the new UI platform selector does not narrow scheduled collection. Issue #4 code was not present in the remote branches at synchronization time; menu producer integration remains pending.

Menu source comparison ignores common tracking parameters (utm_*, srsltid, gclid, fbclid, msclkid) and URL fragments, while preserving the original source URLs in snapshots. Meaningful query parameters remain significant. Content/price diffing is still outside the current weekly comparison implementation.

## Integrated deployment candidate (2026-11-05)

The workflow enables MENU_AUDIT_ENABLED, APIFY_MENU_ACTORS_ENABLED and MENU_OCR_ENABLED. It remains gated by GEO_WEEKLY_ENABLED; no remote activation has been performed. The worker uses the resolved branch identity and website, produces menu date sidecars, and returns full menu details. The CLI deletes scratch outputs after the orchestrator archives public details under runs/<run-id>/details/<store-id>.json. Files are persisted with the existing runs tree to the history branch/artifact. Partial menu coverage appears in the manifest and Markdown report. Earlier notes describing the adapter as pending are historical; this section supersedes them.

stores.json now contains the Issue #10 acceptance targets: Easy Joy (id "020") and Frydom Express (id "001"). Both Place IDs were extracted from verified Google collection results. IDs are strings so leading zeros are preserved; place_id plus address is used for identity resolution. Katz remains a supplementary test merchant, outside the scheduled store list. Stable IDs remain snapshot directory identifiers; names and addresses appear in manifests/reports. Scheduled production acceptance still requires deployment and two actual weekly runs.


## Local fixes and cloud acceptance — 2026-11-05

The collector/workflow is published to main. A manual cloud run completed (Actions 42037510321); both stores were partial, not fully accepted. The user's recurring schedule remains disabled. Manual dispatch is independent of GEO_WEEKLY_ENABLED; only scheduled execution uses that gate. Earlier deployment-pending statements are historical.

Canonical date snapshots remain immutable. After each complete attempt, read `indexes/latest.json` (manual: `manual/indexes/latest.json`) or `indexes/dates/<date>.json`, then follow `path` to that attempt's snapshots, details and diff. These pointers represent the latest finished attempt and expose partial/failed status; they do not assert complete coverage or replace weekly baselines. Legacy archives gain pointers on their next run. The workflow copies the indexes tree when this local change is deployed.

Explicit same-day comparison: `npm run collect:weekly -- --history .local/history --mode manual --compare-run RUN_ID`. The reference must be a prior manual run in that same history, with matching store identity. This mode does not claim consecutive weekly failures. Default scheduled comparison still uses the previous calendar week.

Offline controlled phone test: `node scripts/acceptance-phone-change.mjs RAW_RUN_DIRECTORY samples/issue5/phone-change`. It replays real output, deliberately changes ONE phone digit in a labelled synthetic copy, verifies IMPORTANT in the diff, and leaves source observations/baseline intact. It makes no paid requests and is not cloud/two-week acceptance.

Workers now log each listing result, menu stage and a 30-second heartbeat. Messages contain progress only; provider tokens and raw exceptions are not logged. Configured websites and Google ordering URLs are both checked; an independently configured site must still establish branch identity.
