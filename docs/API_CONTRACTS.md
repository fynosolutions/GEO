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
