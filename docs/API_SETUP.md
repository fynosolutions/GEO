# Restaurant platform audit: setup and deployment

## Current collection scope

### English access and Maps regression handling

All browser contexts request `en-US`, send `Accept-Language: en-US,en;q=0.9`, and launch with `--lang=en-US`. Google navigation requests include `hl=en&gl=us`; Yelp requests include `hl=en_US`. Research prompts request English/US platform pages. This controls language preference; it does not translate proper names or original reviews or guarantee a platform honors the request. Browser records retain `requested_locale` and the page's declared `page_language`, with a note when non-English content is returned.

The Maps candidate list always includes the standard `/maps/search/?api=1&query=...` route, even when research already returned another Maps query URL. Exact place links take priority. Prior successful browser/result URLs for the same restaurant are reused as navigation hints only; facts are always reread. A browser HTTP 200 page with no verifiable fields is marked partial/incomplete rather than inheriting a search tool's blocked status. Screenshot extraction remains enabled for loaded pages with missing text fields.

Listing URL filtering excludes unrelated sources: Yelp browser candidates and field evidence must use `www.yelp.com/biz/...` (or yelp.com equivalent), not trust.yelp.com legal PDFs, marketing pages or search pages. Google candidates must be Maps URLs rather than general Google pages. `readable` in a saved browser attempt means page transport/content was loaded, not that a matching restaurant or any field was verified; the UI spells out that distinction. Old records remain unchanged. This prevents the false impression that an accessible legal PDF is a successfully read Yelp restaurant.

### Screenshot/vision path

`VISION_FALLBACK=true` by default. After text/search/browser paths leave fields missing, a readable platform page with saved screenshots can be sent to the model as `input_image` content. Up to two viewport PNGs are captured (top and after scrolling). `OPENAI_VISION_MODEL` optionally selects a model with image-input support; otherwise `OPENAI_MODEL` is used. There is no image-generation call.

Each image attempt uses at most two requests: extraction and a separate visual verification pass. The model must identify the correct name and branch address, reject challenge/login/blank pages, copy legible text and supply image filenames and bounding boxes (0–1000 coordinates). Only fields supported in both passes are accepted. These are AI checks, not a guarantee of OCR accuracy. UI labels screenshot-derived values and links their evidence images; JSON evidence has scope=screenshot, screenshot, region and needs_review=true.

Same-platform paths fill missing fields only. Existing non-null values are retained; differing alternatives are recorded in conflicts rather than silently overwriting facts. The method may be mixed; per-field evidence retains each source scope. No source supplies another platform's fields. Blocked pages are not sent for visual extraction. Empty or wrong-branch images return null. Image-model errors are recorded without discarding successful text results. Cancellation applies to image calls too.

Image input adds token costs and up to two requests per candidate. Set VISION_FALLBACK=false to disable. Screenshots are stored locally and sent to OpenAI for requested public-page analysis; image recognition does not bypass access controls.

New audits run the official website PLUS all eight platforms: Google Maps, Yelp, Tripadvisor, OpenTable, Uber Eats, DoorDash, Toast, Grubhub. All third-party platforms use the same research, indexed-excerpt, browser-text and screenshot/vision fallback pipeline, with two research workers and serialized browser sessions. Each of the nine sources has the same 15 fields and an independent JSON. The official website remains a separate column and never fills another platform's fields. Historical focused audits retain their original three sources. The UI derives columns and progress counts from each job rather than hard-coding the source count.

The result page has a **Stop search** button. `POST /api/audits/<id>/cancel` aborts in-flight API requests, closes the active browser and stops queued sources. Completed results remain saved. Cancelling cannot undo provider-side processing or costs already incurred. A short cancelling state may appear while browser cleanup completes.

Indexed excerpts for the exact Google Maps/Yelp listing may now supply explicitly stated BASIC facts if opening the listing is blocked. Each evidence item declares `scope`: `direct_page`, `search_excerpt` or `browser`, displayed below the value in the table. An indexed excerpt is not a live page snapshot and its freshness is unknown. A blocked deeper panel no longer clears independently evidenced basic facts. No copying from other review sites or the official website into platform columns is permitted. Missing or unsupported fields stay null.

Previously observed platform URLs for the same website/address seed listing discovery. If no listing is found, the browser may open a clearly identified address-targeted platform search URL; query parameters themselves are never treated as evidence. A Google Maps redirect to an actual `/maps/place/` URL seeds one direct-URL research attempt when the browser panel has no readable facts. Every candidate must still be reverified; these are URL hints, not a cache of facts. If neither the page nor its indexed listing exposes facts, the application cannot promise a non-null result. Official-site facts are currently collected through the research tool into the separate official column.

## Local setup (Windows)

If `.env` is already configured, double-click `Start-GEO.bat` in the project root. It calls the installed Node.js runtime by absolute path and builds/starts without Conda activation or npm being on the current shell PATH. Keep the window open and open the printed local URL. To use a different runtime, set `GEO_NODE` to its full path before launching. It never changes machine/user environment variables. `Start-GEO.bat --check` builds and runs mocked tests only.

1. Open PowerShell in `E:\Work\GEO-main`.
2. Activate the existing environment and install/build:

```powershell
conda activate geo
npm ci
Copy-Item .env.example .env
notepad .env
```

Paste your key after `OPENAI_API_KEY=` in the local editor, then save. Do not send the key in chat or put it in frontend code. If `.env` already exists, edit that file instead of copying over it. The server loads `.env` automatically; existing process environment variables take precedence.

```dotenv
OPENAI_API_KEY=YOUR_REAL_KEY
OPENAI_MODEL=gpt-5.4
HOST=127.0.0.1
PORT=3001
AUDIT_DATA_DIR=.local/audits
```

The model must be available to your API project and support Responses API web search and structured outputs. Change `OPENAI_MODEL` if necessary. A ChatGPT subscription is separate from API billing: configure billing/credits in your API project. Never use an untrusted API proxy for your key.

```powershell
npm run check
npm run build
npm test
npm start
```

Open http://127.0.0.1:3001. Enter the restaurant's official website. For a chain, enter the exact branch address in the optional address input. Submit to navigate to `/results?id=...`. Keep the server running while the result page polls progress. Refreshing the page does not create another paid audit. The existing `python scripts/serve.py` launcher also builds and starts the server and loads `.env` through the server.

## What happens

- Official-site identity research + structured identity extraction.
- Two platform workers, each making web research and structured extraction requests.
- Exact platforms: Google Maps, Yelp, Tripadvisor, OpenTable, Uber Eats, DoorDash, Toast, Grubhub.
- The search-only baseline is 19 model requests (official-site research, identity extraction, official-field extraction, and two requests per third-party platform), plus web-search tool usage. Browser and image fallback add further requests. Some research requests can involve multiple search actions. Costs depend on tokens/tools/model; use API project spending controls and check usage during the first audit. A request times out after 180 seconds; there is no automatic paid retry.
- One active audit per server instance. The webpage shows partial results as platforms finish.
- Fifteen business fields use strings or null. Original wording is preserved except evidence-based English review summaries. Missing or inaccessible content stays null.
- Evidence, sampling metadata, dates, source links and statuses appear below the comparison table.

## Saved files

### Browser fallback

Enabled by default (`BROWSER_FALLBACK=true`). When a search result is blocked/partial/not found and a candidate HTTPS listing URL exists, the server tries up to three candidates in isolated Playwright browser contexts. Windows uses the installed Microsoft Edge (`BROWSER_CHANNEL=msedge`); Linux/macOS can use `BROWSER_CHANNEL=chromium` after installing the matching browser with `npx playwright install chromium`. `BROWSER_HEADLESS=true` is the default; false opens a visible browser window. `BROWSER_PROXY` overrides the browser proxy, otherwise the configured/system HTTPS proxy is used. No personal browser profile, cookies or API credentials are passed to the browser.

The fallback reads visible text/links, expands explicitly labeled hours controls and scrolls twice. It does not implement free-form AI mouse control or automatic newest-review sorting, login, CAPTCHA solving, reservations or orders. Access challenges remain blocked. No candidate URL means no browser attempt; it never invents a listing. Some sites require POST data requests; the read-only network policy blocks them, so browser coverage can still be incomplete.

During fallback the UI shows `browser_running`. JSON records `collection_method` (`web_search`, `browser`, `vision`, or `mixed`) and `browser_attempts`. Expand sources to see attempt notes and screenshot links. Full observations are saved as `<platform>.browser.json` with `<platform>-0.browser.png` (and optional -1/-2) beside the normal platform JSON. Screenshots contain visible platform content and should follow your local retention policy. The browser flow adds up to three extraction requests per attempted platform; these are additional to the 19-request search-only baseline.

Browser values require original evidence matching the observed text or actual link destinations. Verified browser and screenshot observations fill missing fields within the same platform only. Existing values are preserved and conflicting alternatives are recorded. Browser availability is not a promise of platform access or correct model interpretation. Spot-check source identity and evidence.

```text
.local/audits/<audit-id>/
  job.json
  google_maps.json
  yelp.json
  tripadvisor.json
  opentable.json
  uber_eats.json
  doordash.json
  toast.json
  grubhub.json
  identity.research.json
  <platform>.research.json
```

Eight platform files exist from the start and are updated after collection, including failures. `job.json` contains aggregate progress and location identity. Research files contain model research/tool provenance for troubleshooting; treat them as local business records and apply your own retention policy. API key is never included. Runtime data and `.env` are ignored by Git. Restart-interrupted jobs are marked interrupted and should be run again manually; history remains readable.

## Prompts and contracts

English research prompt: `backend/prompts/collect.txt`. JSON Schema and normalization/provenance checks: `backend/audit.ts`. Build copies the prompt into `dist/backend/prompts/`. Change source files, then rebuild/restart.

- `POST /api/check`: `{ "url": "https://restaurant.example", "target_address": null }`; returns HTTP 202 with audit ID and result URL.
- `GET /api/audits/<id>`: persisted job status/results.
- `GET /api/audits/<id>/<platform>.json`: platform JSON download.
- `GET /api/health`: configuration flag and field/platform catalogs, never credentials.

## Limitations and first real acceptance check

The implementation uses OpenAI's hosted web-search tool, not a browser logged into platform accounts. Only an API key is required to configure this route, but it does not guarantee that every site, full menu, review list or date can be read. Search can be cached or incomplete. The prompt requests opening listings and forbids treating snippets as page reads; server checks enforce source domain, tool-returned URL provenance and raw-value/evidence agreement. These checks cannot prove that a model's quotation exactly matches the current live page. Manually spot-check the first real restaurant against source links. `collected_at` means API collection time, not source content publication or freshness.

Test one known single-location restaurant first. Check branch identity, source URLs, raw hours/rating/count, nulls for absent fields, review sample evidence, and eight saved JSONs. All-null/blocked results can be legitimate access limitations. If repeated, that platform needs a licensed API/data feed or another permitted collection adapter; changing the prompt alone cannot supply inaccessible data. No live API requests were made during the automated mocked tests.

## Hosting later

For local use, no cloud deployment is necessary. For a private remote deployment use a persistent Node.js 24.14+ host, run `npm ci` and `npm run build`, inject the API key as a server secret, mount a writable persistent `AUDIT_DATA_DIR`, and run `npm start` under a process manager. A nonpersistent/serverless deployment is unsuitable for these in-process background jobs and local files. Use one instance; do not share this data directory across multiple workers.

The app requires a configured GEO_API_TOKEN for API access and can create billable requests. Keep it bound to localhost or behind an authenticated private reverse proxy/VPN. Do not expose it directly to the public internet; a public deployment needs access control and per-user spending/rate limits first. Set `HOST=0.0.0.0` only behind that access layer. Use HTTPS at the proxy, preserve the Host header and allow outbound HTTPS to `api.openai.com`.

## Errors

On Windows, the server uses the enabled system HTTP/HTTPS proxy when no explicit `HTTPS_PROXY` is supplied. Node fetch previously bypassed Windows Internet Settings, causing `fetch failed` / `UND_ERR_CONNECT_TIMEOUT`. Keep your proxy application running. To explicitly configure it, add `HTTPS_PROXY=http://127.0.0.1:7890` to `.env` (use your actual port) and restart. Explicit settings take precedence. Proxy support uses the installed Node 24 runtime's `setGlobalProxyFromEnv`. Server startup never disables TLS certificate checks or changes machine environment variables. The result page shows a loading animation, elapsed time and current platforms; stopped/failed jobs stop the animation.

- 503 before starting: missing server key; save `.env` and restart.
- OpenAI 401: invalid key; 403: permissions/project access; 429: quota, billing or rate limit; 400: model/tool/schema compatibility. Check the API project dashboard and configured model. Provider bodies are not exposed in the UI.
- `needs_location`: rerun with an explicit branch address.
- `blocked`/`not_found`/`partial`: inspect platform notes and source evidence, not just the null cells.
- Connection errors: server stopped, network restriction, or request timeout.

Official references: https://developers.openai.com/api/docs/guides/tools-web-search and https://developers.openai.com/api/docs/guides/structured-outputs

## Access token (Issue #2)

Node.js >=24.14.0 is required. Configure `GEO_API_TOKEN` separately from provider keys. Every `/api/*` route requires a Bearer token or valid signed session cookie; absent/incorrect authentication returns 401. If the server token is unset, API requests return 503 and no audit starts. Static UI files remain available.

The UI prompts for the access token; `POST /api/session` exchanges valid authorization for an 8-hour HttpOnly SameSite=Strict session. Download links, screenshots, polling and cancellation use the same-origin cookie. No token is stored in URLs or browser storage. Set `COOKIE_SECURE=true` behind HTTPS; rotate the token and restart to invalidate old sessions. Keep TLS enabled and use a private authenticated deployment. Existing cross-origin mutation checks remain enforced.
