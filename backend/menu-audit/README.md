# Menu and opening-hours audit — issue #4

This module adds independent files without changing the existing thirteen-field platform records. CLI:

```sh
npm run build
npm run collect:details -- --stores stores.json --store STORE_ID
# Reuse an existing eight-platform snapshot to avoid repeating basic collection:
npm run collect:details -- --stores stores.json --store STORE_ID --records out/restaurant.json --sources sources.json
```

Live commands can incur Apify charges: basic collection when no snapshot is supplied, plus nine bounded platform-search queries for menu candidate discovery. Sources are not extracted from search snippets. Their pages must be fetched and their branch identity confirmed. Existing matched listing URLs and same-site menu links inherit identity; newly discovered URLs must contain the configured name and address. This is conservative and can produce unverified sources. No login, CAPTCHA bypass or retry storm is used.

Fill stores.json first. Sources is an optional JSON array with channel, platform, url, identity_verified and optional menu_id/upload_date. identity_verified:true is a caller assertion that this resource belongs to the target branch; use it only after checking. Automatically discovered links never receive this assertion without a verified parent on the same host. Explicit menu_id identifies a menu across URL replacements; otherwise the URL path is part of the identity and replacements cannot be inferred reliably.

The seven channels are official_html, official_file, google_menu, yelp_menu, delivery_menu, reservation_menu and social_menu. A category contains per-platform/source attempts, with found/not_found/unverified/error/not_checked states. A successful visit with no extracted menu is not proof that the entire platform has no menu. Only observed same-host menu links are traversed, max 30 documents per run, 12MB each and 20 PDF pages. Separate sources can cover externally hosted official PDFs.

## Output

`out/details/<store-id>/<run-id>/` contains:

- channels.json: all seven channel records including found, status, attempts and fetched_at. Missing or blocked sources remain explicit.
- menus.json: required channel, url, format, menu_date, date_source, fetched_at; additional menu_id, platform, date_text, freshness, year, sha256, extraction.
- prices.json: original name, variant, price string, currency only when explicit, evidence, menu reference, url and fetched_at. OCR and simple line parsing need manual verification; no price correctness verdict.
- hours.json: platform/day/open/close/google_open/google_close/diff_minutes/verdict plus reason and both source URLs/timestamps.
- summary.json: identity, run ID, coverage status and cross-channel date flags.

Dates preserve YYYY, YYYY-MM, YYYY-MM-DD or season/year. Only menu/update/version markers are accepted as on-page evidence; copyright years are ignored. Multiple conflicting on-page dates are unknown. Date evidence priority is on_page, metadata, upload_date, unknown. Metadata is from the fetched resource, not another homepage. Seasonal dates retain the whole-year uncertainty. Freshness uses calendar-month boundaries: fresh, stale, unknown_date; uncertain_date and future_date are explicit supplemental states for insufficient precision/anomalies. Never invent a day.

Hours parse regular English weekday maps or day/hours arrays, including 12/24-hour clocks, split intervals, overnight, Closed and 24 hours. Unsupported or missing values produce verdict:null and a reason. Scalar times remain strings; split-day values are arrays. diff_minutes is platform close minus Google close; negative means earlier. Closing differences are arrays for split intervals. Opening differences also cause inconsistency. The delivery exception applies only when opening times match and each closing difference is between -30 and 0. Values exactly equal have verdict 一致. Verdicts match the Issue's Chinese vocabulary.

## PDF and image extraction

Text PDF extraction uses pdfjs-dist. For images/scanned PDFs set MENU_OCR_ENABLED=true to use local Tesseract English OCR; its language model may download on first use. No additional paid API key is required. For unsupported scripts or poor image quality, keep extraction evidence and review manually; do not assume OCR is exact. The regular collector process timeout still bounds weekly runs. No image uploading service is configured.

## Weekly integration

Set MENU_AUDIT_ENABLED=true for weekly workers to produce details and pass menu observations to #5 in the same run. Without it, weekly basic collection is unchanged. Whole menu-audit errors preserve basic records and leave menu comparison unavailable. Stable menu IDs support URL replacement; URL-derived IDs remain conservative. This is not yet enabled in the deployment workflow. Calendar precision is now accepted by the weekly sidecar adapter.

## Validation limits

Automated tests cover date priority/precision, 2024 stale, missing date, calendar thresholds, 30/45-minute delivery closing cases, opening mismatch, overnight, seven-channel status, structured/text prices and weekly URL replacement. These fixture tests are not the two-store/seven-channel real acceptance or the ten-price manual check. Current access restrictions and unsupported layouts can leave channels incomplete. No claim of complete menu coverage is made merely because discovery found a URL.

## Optional web collection

Below Platforms to collect, check Collect menus from selected platforms. Default mode is Menu links and dates: HTML/PDF/image URLs, date evidence and collection status; dish prices are not extracted/exported. Full menu details and prices preserves the Issue #4 price requirement. Menu work is limited to the selected platforms; no official/Resy/Instagram discovery is implicitly added when they were not selected. Tripadvisor menu extraction currently reports unsupported. The CLI defaults to full mode and seven-channel discovery. Results render source links and can be opened as a separate JSON result; the basic listing JSON contract stays unchanged.

Full-mode menus.json now embeds each menu’s items with original dish names and prices, so auditors can verify prices without joining prices.json. Every item carries source URL and fetched_at; raw price objects, such as pickup/delivery prices, stay objects. Links-only mode intentionally contains no item content. The result page expands embedded dish/price tables when present; existing historical links-only audits are not retroactively changed.

## Seven-channel flow (2026-11-05)

The web form now defaults to all_channels when menu collection is enabled; API callers default to selected unless menu_scope is supplied. Google-resolved official website metadata feeds official discovery without changing listing output. Resy and Instagram searches run in full-channel mode. Public labelled menu images in verified HTML/JSON-LD are queued with associated upload dates, including CDN files. Interactive or blocked customer-photo galleries remain incomplete rather than being claimed as accessible. Official openingHoursSpecification is read from branch-matched structured identities; multi-branch pages do not blindly select the first branch’s hours.

All-channel collection can incur additional discovery and OCR work. Boundaries remain 30 documents, 12 MB and 20 PDF pages. Live acceptance must record blocked/unknown states and distinguish them from a successful search that yielded no menu.

## Dynamic ordering menus and confirmed entry points (2026-11-06)

Supported MealKeyway, Chowbus and Yelp `/menu/<business>` pages are read using an anonymous browser by default (`MENU_BROWSER_ENABLED=false` disables rendering). Install the project browser with `npx playwright install chromium` (Linux CI: `npx playwright install --with-deps chromium`); `BROWSER_CHANNEL=chrome` can use an installed Chrome; macOS also tries installed Chrome when the requested default Chromium executable is missing. Each resource is bounded by `MENU_BROWSER_TIMEOUT_MS` (default 90000; MealKeyway 180000; maximum 180000), plus browser navigation/cleanup. The reader waits for supported priced cards, preserves original names/categories/prices and never clicks order, checkout, login or CAPTCHA controls. Scheduling/intro overlays do not require starting an order when menu cards are already in the DOM. Access challenges remain errors. Browser DOM evidence has extraction `browser-dom`; copyright, order dates and fetch time do not become publication dates.

Official pages may follow labelled Order Online / 点餐 links to the two supported ordering hosts. Cross-domain candidates must independently match target street and Google phone unless explicitly verified by the operator; unrelated external links do not inherit identity. A matched Yelp business page also queues its dedicated `/menu/` page before reading the general page. Reservation URLs are not converted into menu evidence. Within a run, shared destinations are read once but retain separate channel observations (for example Google → Chowbus and official → Chowbus); do not count them as independent menus or unique dishes. `discovered_from` optionally preserves the referring URL. Meaningful merchant query parameters and SPA routes are retained.

`stores.json` accepts optional `menu_sources` (max 12 per store), with `channel`, `platform`, `url`, `identity_verified` and optional `discovered_from`. `identity_verified:true` records an operator-verified branch association, not automatic discovery. The current Easy Joy/Frydom entries were confirmed by the operator and browser checks on 2026-11-06. These sources feed CLI/weekly collection; the web interface loads them only after a resolved Google name/address matches exactly one configured branch. No extra Actor is required. Unknown channels remain incomplete rather than absent.

Optional `MENU_BROWSER_DEBUG=true` writes failed-render diagnostics only to ignored `.local/menu-browser/`. It records public-page DOM and request paths/status, not request headers, and must not be published as an acceptance sample. Existing raw samples are not overwritten by new runs.
