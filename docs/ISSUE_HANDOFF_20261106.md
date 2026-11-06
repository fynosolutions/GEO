# Remaining-issue handoff — 2026-11-06

## Scope and provenance

This pass remains local. It does not push code, publish issue comments, activate the weekly gate, or close issues. Main/remote feature branch were verified at e3616ac before this pass; local fixes were already dirty and preserved. Source files used for the full test are fingerprinted in samples/issue4/source-revision.json. A later HTTPS redirect-deduplication fix is separately regression-tested and publicly probed; the original complete-run outputs are not retroactively rewritten.

## Latest complete real test

Local manual run: `597d254e-e15a-4b02-99d5-9260ab7e2bf0`.

Started 2026-11-06T03:23:14.912Z, ended approximately 03:37:41Z. New York business date is 2026-11-05; the local folder date 20261106 is Asia/Taipei. No run was backdated.

- Easy Joy 020: 7/8 platform records matched; DoorDash 146, Uber Eats 166, Grubhub 146 menu item records. These are per-platform records, not unique dishes. Unknown Grubhub timezone hours remain incomparable.
- Frydom 001: 3/8 platforms matched (Google, Yelp, Uber Eats). Grubhub Catering is rejected. Uber Eats has 61 item records. The configured corporate homepage and Chinese/English menu pages were also read, returning 17/7/7 priced records respectively; do not sum these as unique dishes or claim representative corporate prices are independently verified for the branch.
- Both stores have eight basic records, seven channel records and 56 daily hours rows. Required field/null/provenance validation passed (7 menu documents, 112 daily rows total). Both data statuses are partial; successful execution is not full coverage.

## #9 / #4 evidence

| Requirement | Local evidence / status |
|---|---|
| Two real stores, seven channels | samples/issue4/{easy-joy,frydom-express}/raw-result.json and channels.json; 渠道表.md has 14 rows with found/absent/blocked/not-checked labels and explicit uncertainty |
| Actual 2024 menu | 旧菜单例子/result.json: menu_date 2024, stale, on_page |
| Actual undated menu image | 无日期例子/result.json and original PNG: unknown_date after real OCR |
| Real PDF | 真实PDF例子/result.json: pdf-text, metadata 2023-12-21, stale |
| Delivery -30/-45 min | 营业时间边界测试.json, synthetic and labelled; named test in scripts/menu-audit.test.mjs |
| Ten prices match page | 菜价抽查.md and easy-joy/price-check.json: current independent Grubhub delivery-page check 10/10; other platforms are not implied |
| Source and collection time | Original listing/menu/hour rows preserve URL and fetched_at; blocked and unverified attempts remain visible |

Full run found a remaining HTTPS/HTTP alias bug: an unverified configured HTTPS candidate could mark a redirected document complete before a verified HTTP candidate visited it. Fixed by recording completed documents only after verification; fixture and real website-followup passed. The actual Easy Joy site still yielded no extracted menu, so it remains incomplete rather than declared absent.

New format check: `node scripts/validate-acceptance.mjs RUN_DIRECTORY`.

## #10 / #5 readiness

- Local latest-run indexes correctly point to the latest finished attempt while canonical history remains immutable.
- Explicit manual baseline comparison and one-digit phone simulation passed on this run; samples/issue5/phone-change-20261106/ preserves source/baseline, diff and execution metadata.
- Local Workflow now has manual boolean input `acceptance_phone_change` (default false). When selected after a successful batch, it validates synthetic phone copies of this exact run without any extra Actor calls. Output is under manual/acceptance/phone-change/<Actions-run>-<attempt>, retained by artifacts/history.
- Workflow summary now displays each store's actual data status, matched platform count and menu count. A regression test proves partial is not represented as all-platform success.
- No recurring activation was performed. Actual Nov 9 and Nov 16 Monday 06:00 America/New_York runs cannot be claimed early. They are 19:00 Asia/Taipei on those dates.
- Previous real cloud run/cost is preserved in samples/issue5/cloud-manifest.json and cloud-cost.json. Latest local manual evidence is not represented as one of the required cloud runs.

## #7 / #8 collaboration status

The assigned coworker remains kazame-uuz. Shared current originals are ready. Independent Google phone/rating checks were made for both stores, with Thursday-hours spot checks; Easy Joy Grubhub phone/rating/page hours were read. Yelp and TripAdvisor 403s and the missing Frydom normal Grubhub page are documented with actual snapshots/screenshots. The three-platform-per-store requirement is NOT passed. No cached search snippet or Actor dataset was counted as an independent page check.

The real wrong-address test for #8 passed and is saved unmodified as samples/issue3/wrong-match.json, with command and reference addresses. Five successful Yelp samples meeting Chinese-name/similar-name criteria and three independent Yelp page checks are NOT provided by this one negative test; these still need coworker coordination or further authorized work.

## Validation

Type checks/build passed; 89 automated tests passed. Workflow YAML parsed, deployment static preflight and git diff --check passed. Current raw full-run JSON is copied byte-identically; old evidence is retained in previous-20261105 folders. No original merchant data was manually corrected.

## Next delivery steps

1. Review local patch and evidence, submit/push to the agreed branch and publish the Workflow changes.
2. Run one manual cloud acceptance with acceptance_phone_change=true; inspect actual data status, history index, controlled diff and recovery artifact.
3. After separate authorization for recurring fees, enable GEO_WEEKLY_ENABLED and retain actual Nov 9/Nov 16 runs.
4. Finish/coordinate blocked page checks and five-store Yelp package, then publish issue delivery comments with actual evidence and remaining limits. Do not close all issues from test counts alone.
