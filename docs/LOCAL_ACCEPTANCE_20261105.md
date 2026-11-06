# Local acceptance and cloud follow-up — 2026-11-05

All changes in this pass are local, based on e3616ac. No push, cloud re-run, scheduled activation, or issue closure is part of this pass.

## Code fixes

- Append-only history now has indexes/latest.json and indexes/dates/<date>.json. Follow the pointer's path to the latest finished attempt; failed canonical snapshots remain immutable. Status in the index may be partial/failed and must be inspected. Manual and scheduled histories remain separate.
- Manual --compare-run RUN_ID compares a new attempt with an explicitly selected earlier manual run. Scheduled mode still compares the previous calendar week. An explicit same-day comparison is never labelled consecutive weekly failure.
- Weekly collection logs per-store/per-listing results, menu stages and 30-second heartbeats; no credentials/raw provider exceptions are printed.
- Configured official sites and Google ordering URLs are both checked with independent verification. A configured URL is not automatic branch proof. Brand representative menus are not presented as verified branch-specific prices.
- Yelp mobile listing URLs are accepted during discovery and canonicalized before Actor execution. A targeted real Frydom re-test matched its correct Yelp name/address/phone/hours.
- Grubhub Catering listings are rejected for ordinary restaurant requests. Targeted real Frydom re-test retained matched:false rather than exporting the Catering page.
- Menu discovery failures/non-extraction remain unverified. Static HTML or zero search hits do not establish platform-wide absence. Raw historical cloud output remains unchanged; the acceptance table explains uncertainty.
- HTML menu-card layouts now extract explicit names/category/price. Replay of actual Frydom HTML produced 7 priced records and zero dish-photo OCR candidates. Its website labels these representative brand products and says local store supply/pricing prevails.
- Individual dish photos named menu-chicken-... are not treated as scanned menu pages. Logos remain excluded. OCR language cache uses .local/ocr, with traineddata ignored by Git.
- Image HTTP Last-Modified and dates in filenames are not menu publication evidence. Real undated image OCR returns unknown_date.
- Grubhub numeric weekly schedules with unverified timezone no longer produce false hour differences. Source hours are preserved. The live page displayed 11am–10pm while Actor output was 16:00–03:00; no timezone conversion is inferred from one example.

## Evidence package

- samples/issue1/: both original eight-platform cloud JSON files, pending platform verification table and an Easy Joy official-page screenshot. This is not the three-platform-per-store acceptance yet.
- samples/issue4/{easy-joy,frydom-express}/raw-result.json: byte-preserved original full cloud details. Historical Frydom Catering match is not accepted; see local-targeted-retest.json and README.
- samples/issue4/渠道表.md: fourteen rows, four allowed labels; uncertain attempted sources use 没查 with an explanation, never assert absence.
- samples/issue4/营业时间表.md and local-hours.json: current local parser applied to observed data, with later real Frydom Yelp/Grubhub re-test. Original records are not overwritten.
- samples/issue4/旧菜单例子/: real Grasso's page explicitly says Menu 2024; result is stale, year 2024.
- samples/issue4/无日期例子/: real 618 menu image, OCR evidence and original PNG; result unknown_date. A tequila vintage and asset filename do not establish a menu date.
- samples/issue4/真实PDF例子/: real Grasso's PDF read through pdfjs, metadata date 2023-12-21, stale.
- samples/issue4/营业时间边界测试.json: explicitly synthetic 30/45-minute delivery cases; the named test is in scripts/menu-audit.test.mjs.
- samples/issue4/菜价抽查.md and easy-joy/price-check.json: ten exact-name dishes checked against the visible Grubhub delivery page; 10/10 prices matched. This covers Easy Joy Grubhub only, not every platform or Frydom. Browser screenshot and captured DOM values are included. Other price checks remain in 其他平台待核对清单.md, with actual Uber/DoorDash 403 screenshots.
- samples/issue5/phone-change/: two offline replay attempts on real snapshots, one deliberately synthetic phone digit, IMPORTANT diff and unchanged source/baseline. This is local acceptance, not a cloud/scheduled run.
- samples/issue5/cloud-cost.json: 36 account Actor runs in the previous cloud workflow time window reported US$0.73975 (~US$0.74). Time-window attribution must be checked before final billing; GitHub compute cost is excluded. The later local targeted re-test is outside this amount.

## Commands

```sh
npm run check
npm run build
BROWSER_CHANNEL=chrome npm test
npm run deploy:check
node scripts/export-acceptance.mjs RAW_CLOUD_RUN_DIRECTORY samples
node scripts/acceptance-phone-change.mjs RAW_CLOUD_RUN_DIRECTORY samples/issue5/phone-change
MENU_OCR_ENABLED=true node scripts/acceptance-date-cases.mjs
node scripts/check-menu-prices.mjs BROWSER_CAPTURE_TEXT
node scripts/recompute-acceptance-hours.mjs
```

The export command generates pending tables; preserve independent review annotations before regenerating them. The date-case command reads public URLs and may download an OCR language model; no Apify Actor is started. Browser price evidence must be an independently observed page, not a copied Actor dataset. Live collect/collect:details/collect:weekly can incur Apify charges. Existing phone-change output uses unique attempts and retains its old baselines on reruns.

## Remaining acceptance

- #7: at least three platforms per store with phone/hours/rating page comparisons and screenshots. Assigned to coworker; shared originals are prepared.
- #8: five Yelp store samples, Chinese/similar-name criteria, three page checks and wrong-address example. Assigned to coworker; the Frydom fix/re-test can be shared, not counted as all five.
- #9: full new two-store live collector run after these fixes; branch association for Frydom's corporate site, unresolved/blocked channels and Grubhub missing categories remain explicit. Real date/OCR/PDF and ten-price checks are provided locally; no blanket coverage claim.
- #10: deploy local fixes, run explicit phone comparison in cloud if required, authorize schedule activation, retain actual Nov 9 and Nov 16 Monday 06:00 America/New_York runs. Weekly activation remains false. Do not backdate runs or close #5/#10 before these records exist. Issue delivery comments are prepared by the user.
