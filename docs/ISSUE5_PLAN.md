# Issue #5 implementation plan

Prepared: 2026-11-04. Status: local implementation and offline validation complete; #4 producer integration and cloud acceptance pending. See backend/weekly/README.md for the implemented contract.
Source: https://github.com/fynosolutions/GEO/issues/5
Baseline: codex/geo-audit-apify-20261101; local HEAD 5ffa6f2.

## Outcome and boundaries

Run the existing Apify collector every Monday at 06:00 America/New_York, independently of a personal computer. Preserve immutable public-data snapshots, compare adjacent scheduled weeks, and produce an auditable Markdown report. No always-on web server is needed.

Implement issue #5 orchestration around backend/public.ts. Do not change coworker-owned identity matching (#3), menu extraction/date interpretation or hours comparison (#4). Keep the issue #1 eight-platform, twelve-field JSON array unchanged. Current platforms include Facebook, not Toast or Resy.

## Architecture decisions

- GitHub-hosted Linux Actions runner; Node >=24.14.0; npm ci and build. No local proxy settings and no HTTP server required.
- Dedicated orphan history branch `geo-history` in the same repository for the initial deployment. It holds only public snapshots, reports and manifests, never application code, .env, raw diagnostics or secrets. This separates data from code but is not an independent backup or access boundary; use a separate private data repository if different visibility is needed later.
- Code remains on the user-designated development branch. A small workflow must be deployed to the default branch for scheduled execution. Pin the collector to a tested commit through a deployment variable; update it deliberately after #3/#4 integration. Do not merge unrelated in-progress code into main.
- GitHub Secrets: APIFY_TOKEN. History writes use GITHUB_TOKEN with contents:write only in the persistence job; collection needs contents:read. Verify repository policies permit those writes. Never print secrets or carry checkout credentials into collector subprocesses.
- Artifacts are recovery/download copies, not the authoritative history store. Persist history even when some stores fail; a history push failure must fail the workflow and preserve the artifact.

## Store configuration and storage contract

`stores.json` contains a list of entries with stable id, name, address, place_id. Use a stable directory identifier derived from the configured name plus id to distinguish branches and preserve history through provider renames. Validate unique IDs, safe paths and nonempty name/address before any paid call. place_id can be null with explicit name/address fallback; never invent IDs. Adding a store requires only editing this file.

History layout:

```text
snapshots/<stable-store-directory>/<YYYY-MM-DD>.json
diffs/<YYYY-MM-DD>.md
runs/<run-id>/manifest.json
runs/<run-id>/snapshots/<stable-store-directory>.json
runs/<run-id>/diff.md
```

- Canonical snapshots remain exactly the twelve-field array. Run metadata and menu extension data live separately.
- Use New York business dates, recording UTC start/end times, scheduled week, code SHA, configuration hash, store identity, run id and per-store/platform outcomes in the manifest.
- Archive every attempt under runs. Publish a canonical weekly snapshot once; a same-day retry never silently overwrites it. Explicit promotion may repair an incomplete run, preserving the original attempt and recording the change.
- Manual verification runs use an isolated namespace by default and cannot advance the production weekly baseline.
- Compare the previous scheduled calendar week. A missing week is shown as missing, not silently replaced with a month-old baseline. Last successful observation may be displayed separately with its actual date.
- Invalid or unreadable previous history is a storage error, never treated as an empty first run.

## Implementation steps and ownership

1. Add backend/weekly/README.md, types/config, snapshot storage and an injectable collector adapter. Expose the new module through its public.ts. Reuse backend/public.ts, not private matching internals. Run stores sequentially with isolated scratch output directories; catch whole-store identity failures and emit eight explicit failure records without guessing identity. Add planned command `npm run collect:weekly`.
2. Implement pure comparison functions and report rendering. Preserve raw values in snapshots and old/new report cells. Ignore fetched_at-only changes. Object key order is insignificant; arrays retain ordering unless a documented field adapter proves otherwise. Escape Markdown/HTML in provider data.
3. Add batch manifests, atomic writes, idempotence, per-store timeout/abort, and a bounded overall run. Keep successfully completed stores when later stores fail. Distinguish completed/partial/failed collection from persistence failure.
4. Add `.github/workflows/weekly-collection.yml` with manual dispatch and Monday 06:00 America/New_York schedule, concurrency cancel-in-progress:false, separate collection/persistence jobs, artifacts and Actions summary. Avoid blind retries of paid Actor launches. Check the existing Actor charge limit and bound stores/time/attempts; per-Actor limits are not a total batch spending cap.
5. Add fixture tests, operating documentation and acceptance evidence template. Update package.json/scripts documentation only as needed. Keep changes to shared files small for easy integration with coworker work.
6. Configure Secrets and the pinned collector revision, initialize the history branch, deploy the scheduler to default branch, and perform two-store cloud acceptance. These are deployment steps after local validation; planning alone does not enable automation.

## Comparison rules

| Observation | Interpretation |
|---|---|
| found:true, error:null | Identified listing; compare available fields |
| found:true, error describes missing fields | Partial listing; compare available fields, list unavailable fields separately |
| found:false, error:null | Not found in this collection; may report observed presence transition, never claim permanent closure |
| found:false, error present | Collection/matching/configuration failure: 本周未采到 (Not collected this week); do not infer presence loss |
| Whole-store fatal failure | Failure records for all uncollected platforms; other stores continue |

- Highlight phone, address and hours differences when both observations are available. Null transitions are availability changes, not proof of a business edit.
- Rating/review-count relative change is abs(new-old)/abs(old) > 0.10, strictly greater than 10%. Values must be comparable numeric observations on the same scale. Zero baseline receives an explicit zero-baseline label, not division by zero. Unknown/nonnumeric/ambiguous nested values are reported without a fabricated percentage; field adapters need fixtures and provenance.
- Presence changes require valid observations on both weeks; failed reads are unknown.
- List consecutive failures only for the current and immediately preceding scheduled week. Two manual attempts are not two weeks. Missing runs are reported separately.
- First run establishes a baseline and produces a report saying no prior-week comparison exists.
- #4 menu-date changes: compare the coworker's documented date/provenance output in a separate versioned extension file keyed by store, platform/channel and source URL. Exact schema remains pending #4. Do not infer menu dates from fetched_at or add fields to issue #1 output. Until integrated, explicitly mark menu-date comparison unavailable; issue #5 is not fully accepted without this requirement.

## Validation and acceptance

- Offline fixtures: first run; phone/address/hours changes; exactly 10% vs greater than 10%; zero/null/string/nested numeric values; reordered object keys; absent vs failed vs partial; two consecutive scheduled-week failures; missing week; duplicate names; malicious paths; escaped report values; bad history; store exception; timeout; rerun immutability and history push conflict.
- Use synthetic fixture edits to demonstrate phone-change detection. Never edit public restaurant pages or fabricate production history.
- Run npm run check, npm run build, npm test, git diff --check and workflow syntax checks. Check timezone/DST schedule and that manual runs cannot contaminate production baselines.
- Manually dispatch two real stores on GitHub. Verify eight records per snapshot, report, manifest, history commit and recovery artifact. Record partial platform coverage honestly; do not equate CLI exit 0 with all platforms successful.
- Record two distinct automatic weekly runs with Actions URLs, timestamps and history commits. Cannot replace this acceptance item with two manual runs.
- Integrate #3 and #4 through the public collector/extension contracts, rerun regression tests, then update the pinned deployed revision.

## Deployment facts and references

GitHub supports an IANA timezone on schedule entries. Planned expression: cron '0 6 * * 1', timezone 'America/New_York'. Scheduled workflows must exist on the default branch; high load may delay or drop runs. Therefore 06:00 is the requested trigger time, not a hard execution SLA. Document missed-run detection and manual recovery; do not backdate recovered observations.

- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## Completion gates

A. Local implementation and deterministic tests.
B. Cloud deployment and two-store manual acceptance with persistent history.
C. Menu-date integration and two actual weekly scheduled runs.

Current state: plan prepared only. No cloud resources, remote branch, Secrets, paid collection, scheduled job or application behavior changed by this plan.

## Implementation decisions (2026-11-04)

Implemented stable store IDs as snapshot directory names, with display names in manifests/reports. The workflow checks out the tested merged triggering revision rather than a separate collector-ref variable; deploy after merging as requested. Menu-date sidecar validation and comparison are implemented; the producer adapter awaits #4. Canonical retry promotion is deliberately not automatic. Current code and validation details are in backend/weekly/README.md and scripts/weekly.test.mjs. Earlier planning language above records proposed work, not cloud acceptance evidence.
