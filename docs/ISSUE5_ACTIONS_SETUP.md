# GitHub Actions preparation — issue #5

Repository: https://github.com/fynosolutions/GEO
Checked 2026-11-04: public organization repository; connected GitHub account reports admin permission; default branch main. Actions settings and existing Secrets were not verified (browser access timed out). No remote settings were changed.

No separate GitHub Actions account or cloud-server registration is required.

## Prepare now, activate after merge

1. Open https://github.com/fynosolutions/GEO/settings/actions . Ensure repository/organization policy permits the GitHub-owned actions used in weekly-collection.yml: checkout, setup-node, upload-artifact, download-artifact. The workflow requests contents:write only for persistence; it does not need permission to create or approve pull requests. Retain restrictive defaults where the explicit job permission is sufficient.
2. Open https://github.com/fynosolutions/GEO/settings/secrets/actions . Add repository Secret APIFY_TOKEN from your existing Apify account/local configuration. Do not paste it into chat, commits or ordinary Variables. If a Secret already exists, verify with its owner rather than blindly replacing it.
3. Open https://github.com/fynosolutions/GEO/settings/variables/actions . Prepare GEO_WEEKLY_ENABLED=false. This gates both scheduled and manual jobs. Optional APIFY_MAX_CHARGE_USD controls each Actor's cap; the current workflow defaults to 1. It is not a batch-wide budget.
4. Fill stores.json with the verified acceptance stores (id, name, address, place_id, optional website). The two acceptance stores are configured with string IDs and verified Google Place IDs.
5. After merging #3/#4/#5 and validation, deploy the workflow/code to main, set GEO_WEEKLY_ENABLED=true, and manually dispatch from https://github.com/fynosolutions/GEO/actions . Confirm manual history snapshots, report, artifact and geo-history commit.
6. Leave scheduling enabled for two Monday 06:00 America/New_York runs and retain acceptance evidence. Until then, do not claim two-week acceptance.

GITHUB_TOKEN is supplied by GitHub to workflows; no manually created PAT or server key is needed for the same-repository history design. geo-history is initialized by the persistence job; no manual branch setup is necessary. Public repository history is also public, so persist only public merchant observations.

The current setup gates scheduled and manual execution together. Keep false until ready for the first live test. No Apify charges occur merely from saving these configuration values. Actual collection consumes Apify usage; GitHub Actions usage/billing is separate.

Official reference: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets

## Ready-to-test configuration — 2026-11-05

Run `npm run build` then `npm run deploy:check` locally before publishing. stores.json contains two real acceptance stores. Weekly full menu collection/OCR flags are set in the workflow. Complete public menu details are included in run archives, alongside the basic snapshots and menu-date sidecars. Cloud initialization, Secrets, GEO_WEEKLY_ENABLED activation and real scheduled runs still require the deployment step; none is implied by these code changes. The workflow and merged collector must both be present on the default branch before enabling the gate.

## Issue #10 store identifiers — 2026-11-05

The production acceptance list is Easy Joy (`"020"`, 145 Mulberry St) and Frydom Express (`"001"`, 781 61st St). IDs must remain strings; snapshots use `snapshots/020/` and `snapshots/001/` under the scheduled history root. Both Google Place IDs are now populated from matched collection results, not inferred from names. The Issue-specified websites remain in configuration. Google currently returns a Chowbus ordering URL for Frydom; verify the configured website and ordering-site relationship during the full-channel acceptance run. No existing historical directories are renamed by this configuration change.

## Cloud activation procedure — 2026-11-05

Publish the verified code through PR #11 to main. Repository Actions use GitHub-owned actions, read-only default workflow permissions and a job-specific contents:write permission for geo-history. Store APIFY_TOKEN only as an encrypted repository Secret. Set APIFY_MAX_CHARGE_USD=0.50 for initial acceptance (per Actor run, not a total budget). Enable GEO_WEEKLY_ENABLED=true only when ready to collect. Dispatch the workflow from main and retain its actual run URL, artifact and history commit; a configured workflow alone does not establish a successful collection. Schedule: Monday 06:00 America/New_York. Local website hosting is separate and is not provided by this workflow.
