# Yelp diagnostic retest — 2026-10-31

Google Maps collection was not modified. Only Yelp and local diagnostic artifacts were tested.

## Controlled observations

All tests used the existing configured proxy/network route, with no IP rotation, stealth patches, CAPTCHA automation or login.

| Test | Result |
| --- | --- |
| Node HTTPS request to Yelp homepage | HTTP 403; server=DataDome; short HTML challenge referencing captcha-delivery.com |
| Node HTTPS request to Easy Joy's concrete Yelp listing | Same HTTP 403 and challenge markers |
| Standard isolated Edge context, without the project's request-filter routes | HTTP 403; server=DataDome; challenge iframe from geo.captcha-delivery.com; no failed network requests recorded during the observation window |

The screenshot displays a temporary access restriction, not the restaurant page. Its explanatory text lists abnormal browsing, JavaScript blocking and an IP associated with automated traffic as potential causes. The image includes the observed public IP, so it is kept in local diagnostics rather than embedded in documentation.

## Conclusions and limits

- Confirmed: DataDome access control blocks the tested route/session before restaurant facts are delivered. It also blocks the homepage, so this is not simply a missing restaurant URL.
- Confirmed: bypassing the application's read-only request filter does not remove the restriction. No failed requests were observed in that standard-context test; it does not establish that every script ran successfully.
- Likely contributing factors: the configured network/proxy egress reputation and/or fresh automated browser session. The test does not isolate their individual contribution.
- Not established: whether a human's existing browser session on the same network can read the listing, whether the restriction is temporary, or whether the same page is accessible through another permitted data integration.
- A new prompt, structured extraction or OCR cannot extract restaurant facts from this challenge screen. Repeating paid model calls on it is not useful.

## Next diagnostic and operational options

For further discrimination, compare the exact URL in the user's normal browser with the same network configuration. A successful existing session would point toward browser/session differences; a blocked normal session would point toward broader network/access restrictions. This comparison has not been performed by the agent.

For production collection, consider a human-assisted pause/resume browser flow or appropriately licensed Yelp data access. The current app has no human takeover/resume workflow. Yelp data licensing and endpoint permissions must be checked separately from the OpenAI key.

Local evidence: `.local/yelp-diagnostics-20261031/report.json`, `home.response.html`, `listing.response.html`, `edge.response.html`, `edge.png`. Raw challenge HTML can contain transient challenge identifiers; keep it local and do not commit it.

Official data-access reference: https://docs.developer.yelp.com/docs/yelp-insights
