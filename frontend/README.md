# Frontend

Local visualization/test interface. Submit a name or Google place ID, poll progress and preview/download the records saved to the single output file. No collection business rules or credentials belong here. See [the contract](../docs/API_CONTRACTS.md).

The input form includes an optional branch address and eight platform checkboxes. The search preview shows name + address. Empty selection is blocked; only checked IDs are submitted. Results display matched separately from found.

The results page has independently collapsible sections for menus, opening-hours comparisons, restaurant information, and downloads. Sections start expanded; the header controls expand or collapse all visible sections. Data refreshes preserve each section’s open state and the hours platform filter. Native summary controls support keyboard navigation.

Restaurant information appears first. When menu collection is enabled, the form defaults to full details and prices. Available dishes are shown in expanded, scrollable price tables inside each platform card; missing prices remain unavailable. Legacy menu price records can be displayed when menu ID, channel, and source URL match. Links-only reports explain that dish details were not saved and require a new full-details audit.

Menu categories use the explicit category field; variants are not shown as categories. Refreshes preserve dish-table and source-check disclosure states for the same platform/menu source. Successful source checks display a success explanation.

Price cells support Grubhub pickup/delivery objects alongside scalar and display/amount prices. Both service prices remain in the same Price column, zero is valid, missing values stay unavailable, and no currency is inferred. Saved audit JSON is not rewritten for presentation.
