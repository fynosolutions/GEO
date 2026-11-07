# File contract and local test API

The corrected user-requested batch interface (2026-11-07) is **out/batches/&lt;batch-id&gt;/&lt;restaurant-name&gt;.json**, one UTF-8 array per restaurant, with ten platform records by default and the exact single-store schema. Single-store debugging retains **out/&lt;restaurant-name&gt;.json**, one UTF-8 array of platform records without a job wrapper. The current revision adds matched as explicitly requested by the user. No values/evidence wrapper, official-site record or Toast record is emitted.

## Batch input and output

CLI: `npm run collect -- --stores <path.json-or-txt> [--platforms yelp,instagram]`. Do not combine --stores with --name, --place-id or --address. Web/API: POST /api/check with `{stores:[{id?,name?,place_id?,address?}],platforms?}`. The stores value can also be JSON text or one `name | full address` per line, matching the web paste/upload input. Each row requires exactly one of name/place_id; address and id are optional. Generated ids are store-001, store-002, etc.; explicit ids must be unique safe ASCII slugs of at most 64 characters. Input strings are trimmed and limited to 500 characters. Validate all 1–20 stores before any provider call. Batch submissions cannot contain a single target or menu_mode. API body limit: 64 KiB.

Every input store gets exactly one JSON file, including failed or cancelled stores; six inputs produce six files. Each file contains only Listing records in catalogue order, without store_id, input or any batch wrapper. Default selection produces ten records; an explicit subset still limits platforms. Each record uses the category-specific fields below, identical to single-store output. Google's resolved name determines the final filename; filename sanitization and store-id suffixes prevent same-name and case-insensitive collisions. Unresolved inputs use their input name/place ID as a file label without inventing verified merchant facts. Input/identity/progress metadata remains in job state. Internal single-store collector files go to ignored .local/batches/, not additional public out/<name>.json files. Renaming a resolved filename replaces its initial placeholder so the batch directory retains exactly one file per store.

Stores run sequentially through the existing Google-resolution/two-fact platform matching path. Store/provider failures retain English error reasons and do not prevent later stores. Atomic file replacement publishes progress, with pending rows until collection; consumers should wait for a terminal job status. Stop cancels the whole batch's signal, aborts active Actor work and marks remaining stores cancelled without starting their Actors. Completed records survive. A new batch never overwrites a previous directory.

GET /api/audits/<id> includes `batch` for list jobs: directory, output_files keyed by store id, total/completed, current_store_id and stores with input/status/records/error/filename/output_file. completed counts attempted stores; untouched cancelled stores are shown separately by status and do not count as processed. GET /api/audits/<id>/stores/<store-id>.json downloads that store's saved file with its restaurant filename. Unknown stores and nonexistent jobs return 404. Old batch platform-download routes return 404. Existing authorization, cross-origin checks, one-active-job cap and cancel endpoint apply equally to batch jobs. The single-store output.json route is unchanged.

## Platform records

Current user-requested revision: each record additionally includes `matched`. Only requested platforms are emitted, in catalogue order: google_maps, yelp, tripadvisor, opentable, doordash, uber_eats, grubhub, facebook, resy, instagram. Omitted `platforms` means all ten; an explicit empty list or unknown platform is rejected. Google Maps is always used internally to resolve identity, including when it is not selected for output. Discovery queries and platform Actors are limited to selected platforms. No third-party Actor runs when Google identity cannot be resolved uniquely.

The latest 2026-11-07 user revision adds `rating_raw` to **the eight original listing platforms only**, while `rating_value` and `review_count_value` remain excluded. The eight original platforms use the listings category with rating/review_count; Resy and Instagram use profiles with followers/posts and omit rating/review_count. Resy and Instagram omit rating_raw as well as rating/review_count. Category metadata does not add an output wrapper.

Input may include `platforms: ["yelp", "facebook"]`; the CLI accepts `--platforms yelp,facebook`. An optional branch address is joined with the name in the Google search input. A source record needs two matching identity facts (name, address, phone) against the resolved Google identity. Otherwise `matched:false`, `found:false`, identifying/business values are null and error explains the failure. Successful matches have `matched:true` and retain source values. This explicit user revision supersedes issue #1's original twelve-field limit and earlier notes excluding matched.

| Field | Type / meaning |
|---|---|
| platform | String identifier above |
| found | Boolean; only true for an identified listing. False on absent, ambiguous, blocked or failed collection; consult error |
| matched | Boolean; two identity facts agree with the resolved target; false when unconfirmed, without returning a different business's data |
| url | Platform listing URL or null; not the restaurant's website substituted as evidence |
| name | Original name or null |
| address | Original address value (string or object) or null; never joined or reformatted |
| phone | Original phone value or null; no reformatting |
| hours | Original provider hours value: array, object, string or null; no weekday restructuring |
| rating_raw | Listings only. Original rating and review count together: preserve an existing rating object with its count fields and extra keys; combine separately returned values as {average: original rating, count: original review count}, preserving types and text; unknown values are null |
| rating | Listings only. Original provider value or null; explicit Facebook `Not yet rated` text (including its review-count suffix) becomes numeric 0 by user request. Other ratings are unchanged |
| review_count | Listings only. Original review-count value or null; no numeric coercion; not followers or likes |
| followers | Profiles only. Original follower-count value or null; never substituted from reviews, likes, or a linked Instagram account |
| posts | Profiles only. Original total post count or null; never the length of a sampled recent-post list |
| price_level | Original provider price value or null; numbers stay numbers; no currency conversion |
| fetched_at | ISO 8601 UTC timestamp with Z |
| error | English reason or null |

Every found:false record includes a non-empty, concise, single English sentence in error, including a successful empty dataset. Reasons distinguish no public listing, insufficient identity evidence, street-number conflicts, ambiguous matches, invalid source URLs, provider/configuration failures, cancellation and unstarted collection. Examples: `No matching public listing was found.` and `Candidate found but matched:false; only name matches (missing: address, phone).` No results do not prove that a business has never registered an account; exports do not claim non-registration or append a registration disclaimer. Rejected candidate business fields remain null. When retries fail for different reasons, export the most relevant reason rather than concatenating each attempt; full run/attempt evidence remains in diagnostics. The UI repeats the concise reason below Listing found: Not found and also shortens verbose legacy messages for display, without rewriting historical JSON.

A found listing with unavailable fields has null values and an error listing unavailable fields. A complete successful listing has error:null. Unknown is not closed, zero or a negative fact; the explicit Facebook conversion above is the only exception. Resy does not normally expose followers/posts in the configured Actor, so these remain null and are listed as unavailable. Hours retain the source structure and timezone metadata, when provided; this collector does not infer a timezone or convert times.

Instagram uses the profile's fullName and businessAddress/businessPhoneNumber when supplied. Explicit address/phone substrings in the profile biography can supply identity evidence; JSON-encoded addresses are parsed for private comparison only and remain unchanged in output. A matching handle, search snippet or website alone does not satisfy the two-fact rule. Resy's source address1 and resyUrl map to address and url. Resy and Instagram omit rating_raw, rating and review_count even when the Actor response contains rating data. Complete Actor datasets remain in ignored diagnostics.

Google resolves the initial identity using name/address or an exact returned place ID; ambiguity is rejected. Other platform acceptance requires two matching facts among name, address and phone and a valid platform source URL. Explicit street-number conflicts are rejected. Normalization is only for comparison; exported source strings remain unchanged. Conservative comparisons may require manual review when spelling differs.

Platform URL discovery uses the Google-resolved name and full address, including city, state and postal code when supplied by Google. Yelp verifies at most three distinct listing candidates (initial attempt plus up to two retries), stopping immediately on a match. The target Google identity never changes. Tracking query strings, hostname variants and trailing slashes do not make a listing a new candidate. When discovered candidates run out before the limit, one supplemental Apify SERP search with the Google name, full address and quoted street/phone variants supplies untried listing URLs; this search is candidate discovery, not a detail attempt. If three candidates fail, or fewer candidates are available, output is matched:false with null business facts and an error. Every candidate response passes the same identity checks before export.

The resolved Google restaurant name determines the filename for every input. A name field containing a website is resolved by its Google website association; a URL is never used as a restaurant filename. Invalid filesystem characters are replaced, and Windows device names are prefixed. Atomic replacement prevents malformed partial JSON. Intermediate files contain only the selected platform entries with explicit pending errors; consume the final result after CLI exit or a terminal web-job status. Repeated runs replace the same filename; simultaneous CLI runs for the same name are unsupported. Unresolved place-ID runs retain diagnostics and fail without inventing a store name.

Raw responses, screenshots and job state under .local/ are diagnostic files, not extra downstream deliverables.

Yelp candidate discovery additionally uses a Google-phone query when a phone is available. Yelp native and direct search-URL modes are disabled because the Actor internally rewrote US search inputs to yelp.co.uk and failed. The Yelp Actor receives observed business URLs only; candidate searches use the separate Apify SERP Actor. An empty dataset from a run reporting zero successful requests and one or more failed requests is a collection error, not evidence that the platform has no listing.

Candidate detail runs are strictly sequential in discovery order: await one Actor run and validate its response before starting the next. A successful match ends the loop immediately; remaining candidate Actors and comparisons are never started.

## Local visualization API

Shared public.ts entry points: collectRestaurant(input, signal?, onResult?, dependencies?) and startJob(input). Input is {name, address?, platforms?} or {place_id, address?, platforms?}; name may contain a website URL for identity resolution; dependencies is a deterministic test adapter hook.

- POST /api/check: {name, target_address?, platforms?} or {place_id, target_address?, platforms?}; returns 202 with id and result_url. A separate url property is rejected; a website pasted into name is resolved via Apify.
- GET /api/audits/&lt;id&gt;: input, status, records and eventual output_file/filename. Statuses: running, cancelling, cancelled, completed, partial, failed, interrupted.
- GET /api/audits/&lt;id&gt;/output.json: reads the generated file with its filename; 409 while not ready.
- POST /api/audits/&lt;id&gt;/cancel: aborts this job and sends `POST actor-runs/<run-id>/abort?gracefully=false` for its active Actor runs (including discovery/menu discovery). Output and completed records are preserved; unstarted platforms receive cancellation errors. The results-page Stop button calls this endpoint. It does not abort unrelated account runs. While a start acknowledgement is pending, retain that bounded request to obtain the run ID and abort as soon as it arrives. Network failure can prevent remote confirmation; diagnostics record that failure.
- GET /api/health: provider availability, fields (the union), platforms, platformGroups and fieldGroups; consumers use each category's field list rather than requiring every union field on every record.
- GET/POST /api/session: existing optional remote-access token gate; loopback without GEO_API_TOKEN requires no login.

Old per-platform downloads, screenshot API, comparison.js and website input paths are removed. Cross-origin writes are rejected. API messages are English. Integrations should consume the file rather than the visualization API.

## Current collection mode

Browser is temporarily disabled in code, regardless of BROWSER_FALLBACK. Google Maps resolves identity; Apify Google Search discovers listing URLs, and platform Actors other than Yelp also have native search inputs. Search snippets supply URLs only, never business field values. Mapped values preserve the exact source JSON types, whitespace, spelling, missingness and structure. Private comparison text is separate and never exported.

## Weekly consumer (#5)

The weekly module consumes the default ten-entry array using the category-specific keys above. Historical eight-entry snapshots remain readable without rewriting them; run metadata and optional menu-date observations are separate files. See [weekly storage, CLI and menu-sidecar contract](../backend/weekly/README.md). Stable store IDs identify snapshot directories. Manual and scheduled histories are isolated.

## Menu details (#4)

The independent menu-audit output preserves the Issue's menu and daily-hours field names. Supplemental evidence, freshness uncertainty and channel coverage statuses are documented in [menu-audit/README.md](../backend/menu-audit/README.md). No menu rows are inserted into the thirteen-field listing array. Year/month/season dates retain their precision; unknown dates are null. Weekly menu observations now accept these precisions and optional stable menu_id values for URL replacements.

POST /api/check optionally accepts menu_mode: links | full. Omission skips menu collection. Menus run after basic listing collection with the same platform selection; failure retains basic results. Job state includes menu_mode/menu_status/menu_result/menu_error when requested. GET /api/audits/<id>/menu.json returns collected menu details or 409 while unavailable. Links mode omits extracted dish prices; full mode retains price extraction for Issue #4 acceptance.

GET /api/audits/<id>/report.json downloads geo-report.v1: the immutable job listing snapshot plus menu/price/hour details and statuses. It returns 409 while the job runs. The original output.json contract remains the thirteen-field array; historical downloads now use the stored job records rather than a same-name file that a later run can replace. report.json is a combined HTTP export, not another disk output file.

Menu summary.platform_results lists each selected platform's found/status/attempts independently. coverage_complete requires every selected platform to finish as found or not_found; unsupported, incomplete or not_checked platforms prevent completion. A delivery category's found=true is not a claim that all delivery platforms succeeded. Candidate filtering excludes Yelp reservation URLs and Facebook groups/videos; it does not weaken branch matching.

Full-mode menu records additionally embed items:[{name, variant, price, currency, url, fetched_at}] and items_collected:true. Original price types (number/string/object) are preserved, absent prices are null. prices.json remains the flattened price-oriented export. Links mode emits items:[]/items_collected:false and does not claim price extraction. This is an extension alongside the required Issue #4 menu metadata, not a change to listing records.

Menu item category correction (2026-11-04): new full-menu items and price records include `category` (source section/category name or null). `variant` represents an explicit offer or item variant only. DoorDash group names and HTML MenuSection names supply category context. Historical variant-only records are not assumed to be categories. Listing output fields are unchanged.

Price presentation correction (2026-11-05): pickup/delivery price objects remain unchanged in exports and are displayed together in one Price cell. Structured Grubhub menu records may use the verified restaurant’s explicit currencyCode when item/price currency is absent; no currency or category is guessed. Historical audit records remain unchanged.

Seven-channel integration (2026-11-05): `/api/check` accepts optional `menu_scope: "selected" | "all_channels"` (API default selected for compatibility). The form defaults to all_channels when menus are enabled. Listing platform selection still controls the thirteen-field basic output. All-channel mode checks the official site/files, Google/Yelp menus and public labelled photos, delivery, reservation (including Resy), and social sources (including Instagram). Google-resolved website information is orchestration metadata, not a new field in listings. Missing/blocked/unverified sources stay explicit. Public HTML/JSON-LD menu image references may supply upload dates; search result dates are not treated as upload dates. Verified official structured weekly hours are compared without modifying listing records. Scripts cannot guarantee access to interactive/private photos.

Weekly output now archives full public menu details under `runs/<run-id>/details/<store-id>.json`, excluding local directory paths, in addition to menu date sidecars. These run archives are included in the history artifact/branch. Menu coverage errors are visible in store outcomes and diffs. Deployment workflow enables menu collection, menu Actor fallback and local OCR, while GEO_WEEKLY_ENABLED remains the execution gate.

Menu accuracy corrections (2026-11-05): menu traversal compares URLs without fragments and common tracking parameters, preserving meaningful query parameters. Duplicate references do not consume the 30-document read budget; redirect aliases yield one menu result. This normalization does not rewrite saved historical audits. Menu evidence now comes from menu structure/schema instead of generic navigation or dinner product paths. HTML menu items inherit explicit section headings as categories. Image selection excludes vendor-hostname matches and logos/icons. Hours support named weekday ranges and split service periods, preserving 23:59 versus explicit 24:00 and leaving unsupported numeric weekday mappings unknown.


## Acceptance refinements (2026-11-05 local)

The thirteen listing fields are unchanged. Google-associated ordering sites no longer suppress configured official sites; each source retains its own branch-verification status. A Grubhub listing explicitly labelled Catering is rejected for a normal restaurant request. Yelp m.yelp.com listing discovery is canonicalized to www.yelp.com before Actor execution. A bounded search with no result or HTML with no parsed menu is unverified, not evidence of platform-wide absence. Image HTTP Last-Modified is not interpreted as menu publication date.

Weekly history adds `indexes/latest.json` and `indexes/dates/<date>.json` pointers to finished immutable attempts. Manual history keeps its own namespace. `--compare-run RUN_ID` is a manual-only explicit baseline; regular previous-week behavior is unchanged. Automated and offline controlled-change evidence is distinguished from real cloud observations in samples.


### Confirmed menu entries and dynamic rendering — 2026-11-06

Store configuration optionally accepts `menu_sources: MenuSource[]` (at most 12): required `channel`, `platform`, `url`, `identity_verified:boolean`; optional `discovered_from` records the referring page. Configured identity assertions are operator evidence. The web lookup requires a unique Google-resolved store name/address match, while CLI and weekly workers consume the selected store's sources. Ordinary listing JSON remains thirteen fields. Menu records may add `discovered_from` and `extraction:"browser-dom"`; original `items[].name`, `category` and `price` are preserved, including displayed starting-price suffixes and unknown categories. A shared URL can have multiple channel observations; consumers must not sum them as unique dishes. Query merchant identity and meaningful ordering hash routes remain part of resource identity. No reservation URL is counted as a menu solely because Google links to it.

The rating_raw field is null when neither rating nor review count is returned, or identity verification fails; a missing rating_raw alone does not add an unavailable-field error. Facebook Not yet rated text remains verbatim in rating_raw.average with the original count in rating_raw.count, while rating is numeric 0. An existing original object that lacks a count key receives count from the original separate review count; no source values or existing keys are overwritten. Historical snapshots/sample JSON are not rewritten; the weekly reader accepts absent rating_raw only in legacy-read mode.

### Google Maps menu DOM observation

Maps merchant URLs use the dedicated menu-category browser path. Existing menu and dish fields are preserved; optional `collection` on a menu and its source attempt records `complete:boolean`, `reason:string|null`, `categories_discovered:string[]`, `categories_read:string[]`, `scrolls:number`. Partial traversal retains observed dishes and forces `summary.coverage_complete:false`. This metadata describes the exposed DOM traversal only. Limited anonymous views, missing category controls and blocked reads remain unavailable with reasons; they never imply platform-wide absence. Source URLs are the actual Maps merchant page; external ordering sources remain separate observations. Menu dates stay unknown without independent date evidence.
