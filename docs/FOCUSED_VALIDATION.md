# Focused validation — 2026-10-31

## English access and latest Maps regression

Latest failed audit `3890903f-d882-40b3-8779-510814f17163` received browser HTTP 200 with only a loading sidebar, not an anti-bot denial. The original web-tool blocked label was misleadingly retained. Candidate selection did not guarantee the previously working standard Maps search route; this was corrected. Successful historical result and browser URLs are now reused as navigation hints, exact place URLs rank first, and standard search is always retained as fallback. An incomplete loaded page is partial rather than a confirmed browser block.

All browser contexts now request en-US with English Accept-Language, plus Maps English URL parameters and Yelp English locale preference. Evidence matching tolerates only language-parameter differences and records the actual observed URL, so adding hl=en does not drop otherwise verified same-page quotations. Raw business names/reviews are never silently translated. Third-party services may ignore locale preferences; returned page language is recorded separately.

Live English-browser retest returned `page_language=en`, about 2,500 visible characters, the correct Easy Joy branch, English address/status/category, rating 4.8 and 1,165 reviews. Screenshots and original text are in ignored `.local/maps-english-validation/`. A real image extraction plus separate visual checking pass then returned 9 fields in English (original mixed-language business name retained); record: `visual-result.json`. An earlier image request timed out on the network, separately from successful page access. Eight automated tests cover candidate fallback, English context configuration, language-parameter evidence equivalence and the existing collection/vision/cancellation behavior.

## Later screenshot-path validation

The later browser implementation captures viewport PNGs through Chromium's capture API and waits for Maps content correctly. A fresh live Google Maps read returned both visible business text and two images. A REAL image-input Responses extraction plus separate visual verification produced 9 non-null fields from those images: name, address, phone, displayed website, displayed business status, visible opening-time expression, cuisine, rating and review count. Captured rating was 4.8 and count 1,165; these describe that observation, not a promise of present values. Original language was preserved. No full weekly schedule, complete reviews or rating maximum was inferred. Image interpretation still needs spot-checking.

Saved diagnostic record: `.local/vision-smoke/google-visual-result.json`, with source screenshots beside it. Seven automated tests pass, including a canvas-only fixture exercising image input, visual rejection, merge conflicts and cancellation. This new result supersedes the earlier Google Maps all-null observation below. Yelp access restrictions remain unresolved; image recognition does not bypass a 403 or produce facts from a blank/challenge screen.

Scope: official website, Google Maps, Yelp only. Existing other-platform history is preserved.

## Implemented and checked

- Stop search: POST cancellation aborts network waits and browser work, preserves completed results and persists cancelled source states. A persistence race found by the cancellation test was fixed (persist cancelling before triggering abort).
- Official website: independent column using the same 15 keys, independent official.json download. No copying these values to platform columns.
- Partial information: verified basic facts are retained even if deeper access is blocked. Per-field evidence scope identifies direct_page, search_excerpt or browser.
- Discovery: reuse matching-branch URL hints; browser can resolve address-targeted navigation to specific Maps pages; one direct-URL research attempt if a resolved Maps listing has no readable panel.
- Five automated tests pass: network boundaries/challenges, cancellation persistence, raw-value evidence checks and partial preservation, search-only mocked workflow, browser fallback mocked workflow.

## Real observations

Input: https://www.easyjoybuffet.com/

- A real audit produced six official-site fields. Some separate test attempts failed with proxy ECONNRESET / connection timeout. These are not platform-specific anti-bot responses.
- Google browser navigation eventually resolved a concrete Easy Joy listing at 145 Mulberry St. The returned visible text contained controls rather than business fields. Passing the exact resolved listing URL to a real API web-search request still returned inaccessible/no indexed excerpt. Decoding the business name from the URL was deliberately not accepted as listing evidence.
- The specific Yelp location URL returned HTTP 403 in the local browser. A separate real API request supplied with that exact Yelp URL also returned restricted URL and no verifiable business fields.

The requirement that both platforms reliably return basic information for this input is NOT yet verified or achieved in this environment. Do not report that as passing, fabricate values, or copy values from the official website or unrelated directories. A successful manual ChatGPT visit does not establish the same access for this API tool/session. A permitted data connector or a separately accessible source/session would be needed if these restrictions persist.

Diagnostic records remain in the ignored `.local/audits/` and `.local/focused-browser/` directories. They contain source/model observations, not credentials. No anti-bot controls were bypassed.
