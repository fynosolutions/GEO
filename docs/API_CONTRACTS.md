# File contract and local test API

The downstream interface is **out/&lt;restaurant-name&gt;.json**, one UTF-8 JSON array without a job wrapper. Issue #1 specifies platform fields but no top-level container; this implementation retains and tests one array. The current revision adds matched as explicitly requested by the user. No values/evidence wrapper, official-site record or Toast record is emitted.

Current user-requested revision: each record additionally includes `matched`. Only requested platforms are emitted, in catalogue order: google_maps, yelp, tripadvisor, opentable, doordash, uber_eats, grubhub, facebook. Omitted `platforms` means all eight; an explicit empty list or unknown platform is rejected. Google Maps is always used internally to resolve identity, including when it is not selected for output. Discovery queries and platform Actors are limited to selected platforms. No third-party Actor runs when Google identity cannot be resolved uniquely.

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
| rating | Original provider value (including nested rating objects) or null; no scale/type conversion |
| review_count | Original review-count value or null; no numeric coercion; not followers or likes |
| price_level | Original provider price value or null; numbers stay numbers; no currency conversion |
| fetched_at | ISO 8601 UTC timestamp with Z |
| error | English reason or null |

A successful empty dataset yields found:false/error:null. Collection/configuration/matching failures have found:false and a reason. A found listing with unavailable fields has null values and an error listing unavailable fields. A complete successful listing has error:null. Unknown is not closed, zero or a negative fact. Hours retain the source structure and timezone metadata, when provided; this collector does not infer a timezone or convert times.

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
- POST /api/audits/&lt;id&gt;/cancel: aborts work; output and completed records are preserved, unstarted platforms receive cancellation errors.
- GET /api/health: provider availability, fields and platforms; no claim that detection/optimization/reporting is implemented.
- GET/POST /api/session: existing optional remote-access token gate; loopback without GEO_API_TOKEN requires no login.

Old per-platform downloads, screenshot API, comparison.js and website input paths are removed. Cross-origin writes are rejected. API messages are English. Integrations should consume the file rather than the visualization API.

## Current collection mode

Browser is temporarily disabled in code, regardless of BROWSER_FALLBACK. Google Maps resolves identity; Apify Google Search discovers listing URLs, and platform Actors other than Yelp also have native search inputs. Search snippets supply URLs only, never business field values. Mapped values preserve the exact source JSON types, whitespace, spelling, missingness and structure. Private comparison text is separate and never exported.

## Weekly consumer (#5)

The weekly module consumes the default eight-entry, thirteen-field array (including matched) without altering the collector contract. Historical snapshots retain that array; run metadata and optional menu-date observations are separate files. See [weekly storage, CLI and menu-sidecar contract](../backend/weekly/README.md). Stable store IDs identify snapshot directories. Manual and scheduled histories are isolated.

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
