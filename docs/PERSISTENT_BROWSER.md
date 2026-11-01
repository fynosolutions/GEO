# Persistent background browser

The audit now uses Playwright `launchPersistentContext` with a dedicated profile
per platform in `.local/browser-profiles`. It runs without a visible window by
default. Cookies and local storage survive browser closure. Personal Edge/Chrome
profiles are never used. Browser work remains serialized within the server.
Do not run a separate probe while a server audit uses the same profile directory;
Playwright cannot open the same profile concurrently in separate processes.

Optional `.env` settings:

```dotenv
BROWSER_HEADLESS=true
BROWSER_PROFILE_DIR=.local/browser-profiles
BROWSER_SETTLE_TIMEOUT_MS=45000
```

The wait is bounded to 0–120 seconds, after initial navigation. It observes
normal page scripts/redirects, the latest main-document HTTP response, visible
text and challenge iframe URLs. It does not click or solve verification puzzles.
Screenshots are saved after waiting. A remaining challenge produces `blocked`
with null merchant fields, rather than passing challenge screenshots to the
vision extractor. A canvas-only HTTP 200 page remains eligible for visual review.

Restart with `Start-GEO.bat` to load changes. Existing audits remain historical
records; submit a new audit to use the new browser flow. Sessions are local
sensitive data: keep `.local` private and excluded from version control.

To repeat the focused Easy Joy check after building, run:

```powershell
& 'E:\CondaEnvs\geo\node.exe' scripts/probe-easyjoy.mjs
```

It checks the previously discovered Yelp and Tripadvisor listing URLs and saves
separate JSON files, browser snapshots, screenshots and `report.json` under
`.local/easyjoy-persistent-<timestamp>`. If a listing loads, it also attempts raw
DOM extraction and two-pass image extraction using the configured OpenAI key.
No OpenAI call is made for a blocked browser page. This is a direct-browser
diagnostic, not a rerun of all discovery/search channels.

Live check on 2026-10-31: both Yelp and Tripadvisor returned HTTP 403 with
DataDome captcha-delivery challenge frames. Neither completed normal loading
after 45 seconds on each of two passes, including reopening the saved profiles.
Both platform JSON files contain null for every merchant field. Persistent sessions alone do not guarantee
that a site grants access, and these results cannot isolate IP reputation from
other session/browser signals.
