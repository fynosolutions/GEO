# Backend

`server.ts` serves the landing/results pages and local audit API. `config.ts` loads `.env` before `audit.ts` resolves storage settings. `audit.ts` owns OpenAI Responses requests, strict output schemas, provenance checks, background workers and persisted jobs. `prompts/collect.txt` is the English source collection prompt. No API credentials are sent to the browser.

Setup, API contracts and limits: [API_SETUP.md](../docs/API_SETUP.md).

`vision.ts` handles bounded image extraction and a separate visual checking pass. Readable page screenshots may fill missing fields; image-derived facts retain source URL, screenshot filename, bounding region and a review warning. Screenshot analysis cannot reconstruct content hidden by a challenge, verify current freshness, or guarantee OCR accuracy. `mergeSamePlatform` preserves existing facts and records differing alternatives instead of overwriting them.

`browser.ts` provides a serialized, isolated Playwright/Edge read-only fallback. It restricts navigation to the selected platform, blocks private-network requests, captures visible text/links and a screenshot, and stops on recognized access challenges. It never shares the user's normal browser profile. Full observations are saved locally; the poll response contains only attempt metadata. Browser extraction evidence is additionally checked against observed page text/link destinations.
