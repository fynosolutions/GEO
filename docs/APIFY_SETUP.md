# Apify adapters

## Resy and Instagram (2026-11-07)

- Resy: `memo23/resy-restaurant-scraper`. Native input uses `cities:[city]`, `query:name`, `maxItems:5`, `maxConcurrency:1`, `includeAvailability:false`, `enrichEmails:false`. Discovered venue URLs use `startUrls:[listing_url]`, `maxItems:1`, with no city-wide search in the same run. Reservations and email enrichment are disabled.
- Instagram: `apify/instagram-profile-scraper`. Input uses `usernames:[listing_url]` (the documented field accepts public profile URLs), `includeAboutSection:false`. No login, follower-list collection or separate post scraping. Only an observed profile URL starts this Actor; missing URLs produce an explicit skipped note.
- Input fields and Actor existence verified read-only against the public default build schemas on 2026-11-07. Resy build `b0NYWSRjk8RBgWW8t`; Instagram build `jeTZkbCKkAlF9hLdz`. This checks configuration syntax, not account entitlement or live restaurant availability.
- Instagram `followersCount` and `postsCount` map to followers/posts. Resy normally provides neither; preserve null rather than inferring counts from ratings or linked social accounts. Both use the user-requested provisional profile category and omit rating_raw, rating and review_count from exports. Raw Actor datasets retain all original data, including any Resy rating, under ignored diagnostics.
- Stop cancels the job signal and immediately requests force-abort for known active runs. A pending start acknowledgement is kept for at most ten seconds so its run ID can be aborted as soon as received. If the network loses the acknowledgement or abort request, remote termination cannot be guaranteed; the Actor still has its existing 180-second timeout and per-run budget. See [Apify abort API](https://docs.apify.com/api/v2/actor-run-abort-post).

References: [Resy Actor](https://apify.com/memo23/resy-restaurant-scraper), [Instagram Actor](https://apify.com/apify/instagram-profile-scraper). These are data collectors, not reservation-booking Actors.

Configure APIFY_TOKEN and APIFY_ENABLED in .env. APIFY_MAX_CHARGE_USD is an optional per-Actor limit for Collect Information, including retries. Collect Introduction uses the Apify account's usage and billing settings. HTTP errors, inaccessible Actors, timeouts and invalid datasets become platform errors. Running Actors are aborted on cancellation where possible.

HTTP 402 with not-enough-usage-to-run-paid-actor means Apify refused to start a paid Actor due to insufficient available account usage. Lowering the per-run charge cap does not necessarily resolve this account restriction; review Billing in Apify Console. Error handling retains the safe error type without exporting the raw response body or credentials. When all basic records fail, the web job is failed with the underlying reason and does not start menu collection. Existing valid basic data still survives individual platform/menu failures.

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

## Local API token and menu Actors (2026-11-04)

Apify Tokens are created at https://console.apify.com/settings/integrations (Settings > API & Integrations > Personal API tokens). A locally generated random key cannot authenticate Apify. Put the Token in .env as APIFY_TOKEN; do not put it in the frontend. GEO_API_TOKEN is the optional access gate for this app and is unrelated to Apify billing/access. Existing local APIFY_TOKEN was checked successfully through GET users/me; no replacement token was generated.

After build, `npm run apify:check` verifies Token authentication and reads configured Actor builds without launching runs. Scoped Tokens must permit whichever metadata checks and Actor/dataset operations you need; an account-read failure can also indicate missing scope.

Menu mode now first reuses verified Actor datasets from basic collection. Uber Eats menuItems and DoorDash item_list* were already present in previous responses; they had not been connected to the menu output. No extra Actor run is needed when those datasets contain a menu. Their source format remains html (the platform menu page), extraction is apify-structured, and menu_date remains null without date evidence. item_count is a returned item count, not a manual completeness claim.

If no structured menu is available, APIFY_MENU_ACTORS_ENABLED=true enables at most one direct menu Actor call for each matched Uber Eats/DoorDash/Grubhub listing. The local configuration enables it; .env.example leaves it false so new checkouts opt in deliberately. Per-run budget remains APIFY_MAX_CHARGE_USD, not a whole-job cap.

Verified current input schemas from public builds/default:
- memo23/uber-eats-scraper 1.0.52: startUrls, maxItems, maxReviews, includeItemCustomizations, maxConcurrency, maxRequestRetries; menuItems/menuSections are returned by the Actor. Menu profile uses one store, no reviews/customizations/email enrichment.
- memo23/doordash-reviews-cheerio 1.0.64: store page returns store/menu data. Menu profile uses one store; includeAllReviews, includeAllMenuVariants, includeDoubleDashItems, scrapeAllMenus, enrichEmails, detectTech are false. Partner-store add-on items must not be treated as this restaurant's menu.
- natanielsantos/grubhub-scraper 0.0.8: scrapeMenu defaults false. Dedicated _menu_grubhub sets scrapeMenu:true, urls:[verified listing URL], maxItems:1 and scrapeAvailableHours:true.

All structured rows pass branch identity checks before becoming menu evidence. Original structured prices are preserved, including pickup/delivery objects. Links mode omits prices. Unknown dates are not set to the fetch date. Yelp and Google photo/PDF menu coverage is not guaranteed by the basic listing Actors; this setup does not claim menu support for all eight platforms.

Sources: https://apify.com/memo23/uber-eats-scraper ; https://apify.com/memo23/doordash-reviews-cheerio ; https://apify.com/natanielsantos/grubhub-scraper . Schema availability alone does not establish subscription, balance or real collection success.

Read reliability: GET status/dataset calls retry network errors, unreadable JSON and HTTP 429/500/502/503/504 up to three attempts with bounded backoff and the existing total timeout/cancellation signal. POST start/abort calls are not replayed. HTTP 401/402/403 do not trigger automatic read retries; notes distinguish authentication, billing, permission and temporary service failures. Remote cleanup still occurs if run monitoring fails after retries are exhausted.

Yelp discovery accepts observed m.yelp.com/biz/ mobile URLs and sends the equivalent www.yelp.com/biz/ URL to the same configured Actor. This changes only the request alias, not provider field values or Actor configuration. An account Key change does not alter config/apify.json; empty searches, provider errors and rejected branches must be distinguished from permission/billing errors using saved Actor run evidence.
