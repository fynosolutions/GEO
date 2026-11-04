# Issue #4 implementation status — 2026-11-04

Current implementation: backend/menu-audit/{public,dates,hours,extract,cli}. Existing platform listing contract remains unchanged. Commands and output contract: backend/menu-audit/README.md.

Implemented: seven-category coverage records; bounded public-document retrieval; menu-link discovery; HTML JSON-LD and menu-item price extraction; text PDF extraction; optional local image/scanned-PDF OCR; date priority/precision and freshness; calendar-month channel date comparison; daily hours comparison; CLI output; opt-in weekly worker integration and partial-date sidecars.

Validation: TypeScript check and build passed; all 57 regression tests passed; git diff --check passed. Two real official homepages were read. Katz's official /store-menu yielded 85 price records; ten individually selected dish prices matched the source values inspected during this session. Evidence: .local/validation/issue4-menu-1793782930696/prices.json (local, ignored). This is ten-price validation for one source, not seven-channel or multi-platform acceptance.

Open acceptance items:
- Two real stores with complete seven-category checks have not been executed. Some channels may remain blocked/unverified/not_checked; they are never silently reported as verified absence.
- Real explicitly dated 2024 menu and real undated image examples still need evidence. Current stale/unknown tests are synthetic fixtures.
- PDF and OCR paths compile but have not received a live PDF/image end-to-end acceptance run; local OCR language data downloads must be verified.
- Non-English OCR is not configured. Generic dynamic platform layouts can require additional adapters; current static document extraction does not guarantee menu coverage.
- Stable menu IDs must be supplied when identity across a changed URL is known; URL-derived defaults cannot infer replacement automatically.
- Web UI now supports opt-in links/date or full-menu collection on selected platforms, with an overview, platform cards, candidate links and expandable diagnostics. CLI/file outputs remain available.
- Actions workflow does not enable menu collection yet. Full #4 outputs are local out/details files, not yet persisted to the history branch; #5 receives menu observations when MENU_AUDIT_ENABLED=true. This is not full cloud integration.

No deployment or GitHub issue closure was performed. The user ran a live web test: basic identity matching succeeded for six platforms, but no verified menu was returned. HTTP 403 and conservative recognition/association were observed. Follow-up changes improve Yelp association, recognition, diagnostics and provider-hours parsing. Existing live records are preserved unchanged; improvements still need live menu revalidation. The original 53-test validation phase did not run paid Apify acceptance; current 57-test validation uses fixtures. Issue #4 must remain open until real acceptance evidence is complete.
