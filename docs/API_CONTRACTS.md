# File contract and local test API

The downstream interface is **out/&lt;restaurant-name&gt;.json**, one UTF-8 JSON array without a job wrapper. Issue #1 specifies platform fields but no top-level container; this implementation retains and tests one array. No matched field, values/evidence wrapper, official-site record or Toast record is emitted.

Exactly eight entries, in order: google_maps, yelp, tripadvisor, opentable, doordash, uber_eats, grubhub, facebook.

| Field | Type / meaning |
|---|---|
| platform | String identifier above |
| found | Boolean; only true for an identified listing. False on absent, ambiguous, blocked or failed collection; consult error |
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

The resolved Google restaurant name determines the filename for every input. A name field containing a website is resolved by its Google website association; a URL is never used as a restaurant filename. Invalid filesystem characters are replaced, and Windows device names are prefixed. Atomic replacement prevents malformed partial JSON. Intermediate files contain all eight entries with explicit pending errors; consume the final result after CLI exit or a terminal web-job status. Repeated runs replace the same filename; simultaneous CLI runs for the same name are unsupported. Unresolved place-ID runs retain diagnostics and fail without inventing a store name.

Raw responses, screenshots and job state under .local/ are diagnostic files, not extra downstream deliverables.

## Local visualization API

Shared public.ts entry points: collectRestaurant(input, signal?, onResult?, dependencies?) and startJob(input). Input is {name, address?} or {place_id, address?}; name may contain a website URL for identity resolution; dependencies is a deterministic test adapter hook.

- POST /api/check: {name, target_address?} or {place_id, target_address?}; returns 202 with id and result_url. A separate url property is rejected; a website pasted into name is resolved via Apify.
- GET /api/audits/&lt;id&gt;: input, status, records and eventual output_file/filename. Statuses: running, cancelling, cancelled, completed, partial, failed, interrupted.
- GET /api/audits/&lt;id&gt;/output.json: reads the generated file with its filename; 409 while not ready.
- POST /api/audits/&lt;id&gt;/cancel: aborts work; output and completed records are preserved, unstarted platforms receive cancellation errors.
- GET /api/health: provider availability, fields and platforms; no claim that detection/optimization/reporting is implemented.
- GET/POST /api/session: existing optional remote-access token gate; loopback without GEO_API_TOKEN requires no login.

Old per-platform downloads, screenshot API, comparison.js and website input paths are removed. Cross-origin writes are rejected. API messages are English. Integrations should consume the file rather than the visualization API.

## Current collection mode

Browser is temporarily disabled in code, regardless of BROWSER_FALLBACK. Google Maps resolves identity; Apify Google Search discovers listing URLs, and platform Actors also have native search inputs. Search snippets supply URLs only, never business field values. Mapped values preserve the exact source JSON types, whitespace, spelling, missingness and structure. Private comparison text is separate and never exported.
