# Targeted menu follow-up — 2026-11-06

These are program-generated menu outputs from local live follow-up after operator-provided source verification. They target official ordering, Yelp menu and configured Google-to-Chowbus entries; they are NOT a fresh all-platform/all-seven-channel acceptance run. Existing listing snapshots from samples/issue4/{store}/listing.json were reused for identity/hours. Discovery and paid providers were disabled in the test harness; no Actor calls were made. Original primary samples remain unchanged. This follow-up does not close #4/#9.

| Store | Channel | Item records | Actual menu URL |
|---|---|---|---|
| easy-joy | yelp_menu | 150 | https://www.yelp.com/menu/easy-joy-dim-sum-and-ayce-hot-pot-new-york |
| easy-joy | official_html | 153 | https://order.mealkeyway.com/customer/release/index?mid=35554f7339436751782f466c5152626a423569654a773d3d#/main |
| frydom-express | yelp_menu | 43 | https://www.yelp.com/menu/frydom-express-brooklyn |
| frydom-express | official_html | 37 | https://pos.chowbus.com/online-ordering/store/Frydom-Express-Brooklyn/23427 |
| frydom-express | google_menu | 37 | https://pos.chowbus.com/online-ordering/store/Frydom-Express-Brooklyn/23427 |

Each store directory contains byte-preserved menus/prices/channels/hours/summary files plus the original collector result wrapper. The same Chowbus destination appears under official and Google source channels with the same content hash/fetch time; it is one menu observation and 37 dishes, not 74 independent dishes. Menus retain source URL, fetched_at, optional discovered_from and extraction:browser-dom. All five channel observations contain item names/categories/prices. Dates remain unknown where no publication evidence exists.

Yelp business-page static requests still returned 403, but both dedicated /menu/ pages were readable and parsed. Retain that difference. Google Easy Joy photos were not extracted by this targeted fix; its reservation link was not treated as a menu. Unverified PDF, reservation and social channels remain unresolved.

MealKeyway cold loads exceeded the earlier 90/120-second limits in failed attempts. After permitting the public page's observed anonymous initialization/read requests and giving MealKeyway a 180-second bound, the final full menu-module follow-up returned 153 records. Earlier failed run directories remain in ignored .local/acceptance/menu-followup-20261106/pipeline/. This is successful local evidence, not a guarantee for future network/IP conditions or a cloud deployment test.

Source is an uncommitted working-tree revision based on f57bf48; 96 tests plus type/build/deployment-preflight/YAML checks passed. No new code was pushed, no cloud run dispatched, and weekly scheduling remains disabled.

To reproduce using the existing CLI with no Actor calls (existing listing facts are reused):

```sh
npm run build
APIFY_ENABLED=false APIFY_MENU_ACTORS_ENABLED=false npm run collect:details -- --stores stores.json --store 020 --records samples/issue4/easy-joy/listing.json
APIFY_ENABLED=false APIFY_MENU_ACTORS_ENABLED=false npm run collect:details -- --stores stores.json --store 001 --records samples/issue4/frydom-express/listing.json
```

These normal CLI commands also attempt remaining eligible static resources; their coverage may differ from this selected-platform follow-up. They can read public webpages but cannot establish current basic listing facts from historical input. On macOS installed Chrome is used if Chromium is missing; Linux CI prepares Chromium installation. To perform fresh full acceptance, run a new normal audit with menus enabled and full item details, then independently verify the sampled prices against pages from that new run.
