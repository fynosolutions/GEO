# Known-issue fixes — 2026-11-04

Local changes; not deployed or pushed. Validation: TypeScript check/build, 64 regression tests, git diff --check. No paid collection was launched for this repair pass.

- Retry transient status/dataset GET failures (network, unreadable JSON, 429/500/502/503/504), bounded to three attempts and the existing cancellation/timeout. Never replay Actor-start POST. Error notes distinguish start/status/dataset stages and authentication/billing/permission/service failures. No guarantee that a persistently failing service will recover.
- Report selected platforms independently. One successful delivery platform no longer makes failed delivery siblings count as complete. Channel attempts retain individual errors.
- Exclude Yelp reservation URLs and Facebook group/video search candidates before document reads. Branch identity validation is preserved. This does not bypass access restrictions or implement missing Google/Tripadvisor menu adapters.
- Render daily opening-hours verdicts on the results page with a platform filter, source links, reasons and unknown states.
- Add /api/audits/<id>/report.json and a complete-report link, retaining the old basic JSON contract. Actual historical report endpoint checked: HTTP 200, 8 platform rows, 2 menu sources, 56 hour rows.
- Historical output downloads use saved job records, avoiding cross-run overwrites of same-name out files.
- Weekly menu URL comparison ignores common tracking parameters and fragments while preserving actual source URLs. Meaningful query/path changes remain significant.

Existing stored audits are unchanged. New backend reliability/filtering/status rules apply to new runs; the new hours table and complete export also display existing saved results. The two-store/seven-category real acceptance, real PDF/OCR/date samples and two-week scheduled acceptance remain outstanding.
