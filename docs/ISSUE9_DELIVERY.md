# Issue #4 / #9 delivery — 2026-11-06

Completed a fresh, manual, real-API collection of Easy Joy (020, 145 Mulberry Street) and Frydom Express (001, 781 61st Street). Run `8409d050-b86b-425d-867b-3d2761273a1d` ran from 2026-11-06T09:16:46.361Z to 09:32:42.933Z. Both store reports are **partial**: the acceptance verifies transparent channel coverage and the returned evidence, not successful access to every platform.

## Acceptance evidence

| Requirement | Evidence |
|---|---|
| Two real stores, seven menu channels each | `samples/issue4/渠道表.md`: 14 rows using 找到了 / 没找到 / 被挡住了 / 没查; each store's channels.json retains detailed attempts |
| Original program output | `samples/issue4/easy-joy/` and `frydom-express/`: raw-result.json and listing.json are byte-identical copies of the completed run; split files equal their original properties |
| Dates, formats and sources | 11 menu observations retain URL, format, menu_date, date_source and fetched_at; unknown dates remain unknown |
| Real 2024 stale menu | `samples/issue4/旧菜单例子/`: explicit on-page 2024 date, stale classification and year; source linked in its README |
| Real undated menu image | `samples/issue4/无日期例子/`: original image and OCR output; menu_date null and unknown_date |
| Hours comparison | `samples/issue4/营业时间表.md`: 112 daily platform rows; unknown hours remain null with explanations |
| 30/45-minute boundary | `samples/issue4/营业时间边界测试.json`: explicitly synthetic fixtures; delivery closing 30 minutes early is normal, 45 minutes is inconsistent |
| Ten page-price checks | `samples/issue4/菜价抽查.md`: five dishes per store, 10/10 exact matches to independently rendered Yelp menu pages; each store contains page-price-evidence.json, price-check.json and a screenshot |

## Returned menus

Easy Joy: MealKeyway official ordering 153 items, Yelp 150, Uber Eats 150 and Grubhub 135. Frydom: Chowbus ordering 37, Yelp 43, Uber Eats 61, plus official brand pages (17/7/7). Google points to the same Chowbus menu and records a separate source observation. These counts describe page/platform records, **not unique dishes**. Brand-site prices have not been independently confirmed as branch-specific current prices.

The collector now accepts operator-confirmed menu sources, follows verified external ordering links, preserves merchant query parameters and SPA routes, and reads public rendered MealKeyway/Chowbus/Yelp menu cards. Rendering is bounded and does not log in, place orders or solve challenges. A general Yelp page can be blocked while its dedicated public menu is readable. Google Easy Joy photo menus were not extracted. Reservation, social and official-file sources remain unconfirmed where indicated. The four-label table explains that 没查 means no completed verifiable read, including searched-but-unconfirmed sources; it does not assert that no search attempt occurred.

## Validation and reproduction

- `npm run check`, `npm run build`, `BROWSER_CHANNEL=chrome npm test`: 96/96 tests passed.
- `node scripts/validate-acceptance.mjs RUN_DIR`: passed for 11 menu observations and 112 hours rows.
- `node scripts/validate-issue9-delivery.mjs RUN_DIR`: passed for unchanged originals, 14 channel rows, real old/undated evidence, boundary fixtures and 10/10 prices.
- Real run: `HTTPS_PROXY=http://127.0.0.1:7897 APIFY_ENABLED=true APIFY_MAX_CHARGE_USD=0.50 MENU_AUDIT_ENABLED=true APIFY_MENU_ACTORS_ENABLED=true MENU_OCR_ENABLED=true npm run collect:weekly -- --stores stores.json --history .local/acceptance/issue9-final-20261106/history --mode manual`.

The original run records a dirty local source fingerprint in source-revision.json; its null code_sha has not been replaced by a later commit. Previous primary samples are preserved under `samples/issue4/previous-20261106-before-final/`. Earlier targeted observations remain supplementary in menu-followup-20261106/. This delivery has not rerun the changed browser path in GitHub Actions. No weekly schedule was enabled and no local API key was uploaded.
