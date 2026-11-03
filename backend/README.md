# Backend

`public.ts` exposes shared entry points to CLI/HTTP callers. `collection.ts` owns identity checks, field mapping, one output file and Apify URL discovery. `apify.ts` owns bounded Actor runs, pagination and remote cancellation. Browser collection is temporarily disabled; `browser.ts` retains URL/domain validation helpers and the dormant adapter. Field values retain original provider types and structures.

`cli.ts` is the main entry: name/place ID to `out/<restaurant-name>.json`. `audit.ts` persists local visualization jobs; `server.ts` serves that UI and downloads the generated file. `auth.ts` retains the optional existing token gate; no user database or tenant/subscription model exists. `config.ts` loads `.env` and explicit proxy variables without Windows registry access.

See [the contract](../docs/API_CONTRACTS.md) and [Actor setup](../docs/APIFY_SETUP.md). Original responses and screenshots are diagnostics under `.local/` and never part of the exported schema.
