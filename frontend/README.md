# Frontend

Local visualization/test interface. Submit a name or Google place ID, poll progress and preview/download the records saved to the single output file. No collection business rules or credentials belong here. See [the contract](../docs/API_CONTRACTS.md).

The input form includes an optional branch address and ten platform checkboxes in two groups: eight original listing platforms, plus Resy/Instagram profiles. The search preview shows name + address. Empty selection is blocked; only checked IDs are submitted. Results show separate tables for ratings/reviews and followers/posts, with matched separate from found. Stop collection calls the job's cancel endpoint, disables duplicate clicks and polls until cancellation finishes. It cancels this job's active Apify runs and preserves completed results.

Every Not found cell displays the record's reason directly underneath; identity failures explicitly display matched:false. Candidate identity reasons explain matching, missing and conflicting fields. No public result is described as no public listing found, never as proof of an unregistered account. Older records without reasons display an unknown-reason fallback.

Restaurant list mode accepts a pasted list or a JSON/text upload and submits stores plus the shared platform selection. Optional menu collection is disabled in list mode. Batch results display processed/total, per-store status and a restaurant preview selector, plus one restaurant-named JSON download per store. Each download uses the single-store array format. Stop uses the same job cancellation endpoint for the entire batch. Failure cells display one concise English sentence, including when viewing older verbose errors. Parsing and validation remain on the backend; no collection rules or credentials move into the browser.

Only the original eight-platform listing table shows rating_raw; Resy/Instagram profiles omit this row. Objects remain structured and Facebook Not yet rated text stays visible.

The results page has independently collapsible sections for menus, opening-hours comparisons, restaurant information, and downloads. Sections start expanded; the header controls expand or collapse all visible sections. Data refreshes preserve each section’s open state and the hours platform filter. Native summary controls support keyboard navigation.

Restaurant information appears first. When menu collection is enabled, the form defaults to full details and prices. Available dishes are shown in expanded, scrollable price tables inside each platform card; missing prices remain unavailable. Legacy menu price records can be displayed when menu ID, channel, and source URL match. Links-only reports explain that dish details were not saved and require a new full-details audit.

Menu categories use the explicit category field; variants are not shown as categories. Refreshes preserve dish-table and source-check disclosure states for the same platform/menu source. Successful source checks display a success explanation.

Price cells support Grubhub pickup/delivery objects alongside scalar and display/amount prices. Both service prices remain in the same Price column, zero is valid, missing values stay unavailable, and no currency is inferred. Saved audit JSON is not rewritten for presentation.

The home form also submits to **Collect Introduction** with the same name, website, place ID, address and restaurant-list inputs. The selected Google Maps, Yelp and Tripadvisor checkboxes apply to introductions. The introduction page shows original platform descriptions, attributes, highlights and a JSON download per store.
