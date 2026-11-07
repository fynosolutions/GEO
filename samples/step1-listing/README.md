# Issue #12 delivery samples

Six restaurant JSON files contain the ten-platform batch results in the single-store array format. `stores.json` contains the six restaurant names and branch addresses. The completed workbook and `核对表.md` preserve the manual checks of ratings and review counts; every restaurant has at least two platforms checked. The confirmed total collection cost is **USD 2.50**.

Existing `rating` and `review_count` fields are reused. `rating_raw` preserves original rating and review-count values together for the eight listing platforms.

From the repository root, configure `APIFY_TOKEN` in `.env`, then run:

```sh
npm ci
npm run build
npm run collect -- --stores samples/step1-listing/stores.json
```

New collection results are written to `out/batches/<batch-id>/<restaurant-name>.json`. These committed samples and completed verification sheets are retained as the delivery evidence.
