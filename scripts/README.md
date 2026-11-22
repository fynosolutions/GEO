# Scripts

Issue #19's offline name generator lives in [check/step1-names](check/step1-names/README.md). Run `node scripts/check/step1-names/generate.mjs --input "<batch directory>"` to generate `samples/step1-names/names.json`.

Build cleanup, asset copying, runtime validation and node:test/Playwright checks. Tests use synthetic providers unless explicitly invoking the CLI against Apify. No prior-job dependencies, machine-specific launcher or obsolete collection probes remain.

Media scripts are stored in [check/step1-media](check/step1-media/README.md); outputs are saved under `samples/step1-media/`.
