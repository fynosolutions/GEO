# Real-data corrections — 2026-11-05

Katz full-channel audit d7be6371-f525-4420-ac7b-ef21632056ec exposed duplicate fragment URLs, zero-item ecommerce pages counted as menus, missing HTML categories and unsupported Uber Eats weekday ranges. Easy Joy audit 7ccafe49-3de1-44e3-a5e7-90bf191905f7 exposed a menusifu CDN logo treated as menu media.

Fixed canonical menu queue/output deduplication and document-budget counting, structural menu recognition, menu-section category extraction, vendor-hostname/logo exclusion, named weekday ranges and split hours. Existing thirteen-field listing JSON and historical reports remain unchanged. Numeric Grubhub weekday mappings/timezone and platform access restrictions remain unresolved; no guessed conversions are applied.

Validation uses regression fixtures plus cached/current public HTML from Katz store-menu and a dinner-package page, and saved real provider hours. No new paid Actors were launched. New full-channel audits are required to produce corrected historical-free reports; viewing an old report does not rewrite its duplicate items.
