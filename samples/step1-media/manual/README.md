# Manual source archives

All ten declared exception URLs now have user-saved HTML in `pages/` and verified identity/hash/save-time records in `manifest.json`. Corner direct access returned 429 and Michelin returned verification responses; `access-evidence/` contains those responses, not article bodies.

Scripts are stored in `scripts/check/step1-media/`. Run `node generate.mjs --offline-html --out samples/step1-media/current` from that script directory to preserve historical samples. Run `node audit-manual.mjs` to check the archived-source output. Results are saved under `samples/step1-media/current/`.

The ten archives supply 59 entries. The Corner user list supplies 41 visible entries; its cards have names/categories/addresses but no separate editorial introductions, so descriptions remain null with `not_provided` evidence. Two Michelin URLs describe one restaurant; they remain separate source records, not separate businesses. Daily closed status is not treated as permanent closure. No Reddit approval is implied.
