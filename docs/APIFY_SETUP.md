# Apify adapters

Configure APIFY_TOKEN, APIFY_ENABLED and optionally APIFY_MAX_CHARGE_USD in .env. The budget applies to each Actor run, including retries, not a whole collection. HTTP errors, inaccessible Actors, timeouts and invalid datasets become platform errors. Running Actors are aborted on cancellation where possible.

config/apify.json contains Actors and typed input templates. Placeholders: name, address, listing_url, website_url, city. Google retrieves up to five candidates to expose ambiguity. Place-ID runs use a direct Maps URL and verify returned placeId. URL-only Actors wait for observed URLs or browser discovery; slugs are never fabricated.

## Facebook

Official default build schemas verified on 2026-11-03 via each Actor's public builds/default response, actorDefinition.input:

- [Facebook Search Scraper](https://apify.com/apify/facebook-search-scraper), build 0.0.344: categories (required array), searchType, resultsLimit. The configured pages-google mode retrieves detailed public page results using Apify; pages mode was live-tested but returned unrelated name-only results and was rejected by identity validation.
- [Facebook Pages Scraper](https://apify.com/apify/facebook-pages-scraper), build 0.0.528: startUrls (required URL-object array). listing_actor/listing_input selects this when an observed page URL exists.

Mapping: title/name to name, pageUrl/facebookUrl to url, address and phone unchanged, rating/ratingOverall to rating, ratingCount to review_count, priceRange to price_level. Prefer the original rating string because it can express recommendations rather than stars. Followers/likes/check-ins are excluded. Weekly hours remain null unless a supported public hours structure or matching browser JSON-LD supplies them.

Schema verification proves configuration syntax and current Actor existence, not data availability or subscription entitlement. Inspect ignored .local/collections/&lt;run-id&gt;/providers.json and output errors. Missing URLs, ambiguous pages and insufficient identity agreement are rejected.

## Apify-only regression fixes (2026-11-03)

Browser collection is paused. `_discovery` runs apify/google-search-scraper with site-scoped name/full-address queries for platform URLs only. Native search inputs remain configured for platforms other than Yelp, with listing_input for direct-page collection where needed. Yelp uses tri_angle/yelp-scraper for observed business URLs because epctex/yelp-business-api returned demo-only rows in live retests. Actor schema fields were checked against public default builds before configuring the replacement.

2026-11-04: discovery retains the full Google address, and Yelp adds a query using Google's phone when available. The tri_angle native search run RkvSEqvFqvW63dZA3 actually requested yelp.co.uk, exhausted blocked/timed-out requests and returned an empty dataset with SUCCEEDED status. A direct www.yelp.com/search input was also internally rewritten to yelp.co.uk (run o2YotzcitLWn1H69c). Consequently Yelp native/search-URL mode is disabled: this Actor only receives observed /biz/ URLs. When initial candidates run out, one supplemental Apify SERP run uses quoted street and phone-format variants alongside the full address. It never bypasses platform restrictions. Empty runs reporting zero succeeded requests and nonzero failures are errors, rather than proof of no listing. Three distinct candidate checks remain the limit; search queries supply candidates only and do not weaken identity checks.

Yelp address/operationHours, DoorDash nested restaurant/address/rating and observed URL IDs, Facebook p/ page URLs, Grubhub priceRating and Uber Eats nested data are mapped without normalizing their values. Different phone numbers and different hours structures remain visible. Complete provider responses remain in ignored diagnostic files.
