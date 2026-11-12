# Issue #15 delivery status — 2026-11-11

Final code lives in `backend/media/`; generated handoff files live in `samples/step1-media/`. The output retains exactly the Issue #15 article/restaurant keys and six configured branch identities. Final delivery is scoped to this issue and preserves the existing review/menu commits already on main.

Nine sources / 105 entries / 22 original descriptions / 83 null descriptions. All eight media/directory page counts are verified. User-saved Reddit HTML has 47 unique comment nodes matching the declared count: 46 readable and one deleted. All readable comments were reviewed; 12 distinct restaurant mentions retained, first-occurrence spelling/order and original comment paragraphs. Ten user-supplied Infatuation introductions imported from their venue DOM. Raw logged-in HTML stays local; only public article facts, public excerpts and SHA-256/coverage metadata are delivered.

Known gaps: 83 full media/directory introductions are null; missing Time Out addresses and conflicting Infatuation update dates remain null. Michelin's introduction says four while the live count/cards show three. Community location hints do not establish branch addresses. `complete:false` / `ready_for_delivery:false` are strict full-data indicators, not a claim that the issue disallows submission with explicit nulls. The issue permits incomplete fields and explained gaps; mentor acceptance remains separate from submission/automatic GitHub closure.

Existing main browser tests honour BROWSER_CHANNEL, allowing real local Chrome validation without business changes.

Validation commands: `npm run check`, `npm run build`, `npm run verify:media`, `BROWSER_CHANNEL=chrome npm test`, `git diff --check`. Final verification on latest main passed: type check, build, offline verifier and diff whitespace check; 162 tests passed, 0 failed, including 23 media tests. The verifier runs without network or private inputs; exact collection replay requires local raw captures identified in cache-manifest.json.

No paid collection / no Apify runs / Apify cost US$0. No changes to weekly collection, credentials or unrelated issue results. Delivery commit must contain `Closes #15`; the Issue comment must link required files, address every acceptance item, explain all gaps and report validation/cost.

## Local follow-up — 2026-11-12

Fixed the direct parser's unconditional null description assignment and the saved-page import's Infatuation-only restriction. Full export is now the default for recognized source description containers; supplied-only inspection is explicit. Added per-entry presence/export reasons and description-availability.json without changing article keys. Existing cached inputs show all 83 previously null media/directory entries do contain introduction text. This is saved-input evidence, not a live-page freshness claim.

This follow-up ran supplied-only replay: the two user-provided pages export 22 original passages total; 83 other passages remain unselected. Their text was not reproduced in the follow-up output. Article bytes remain identical to the prior main delivery. Reasons now identify not_selected rather than falsely treating those rows as absent or failed. Filling all original passages still requires the corresponding user-provided source material; the local code supports the full export path.

Validation passed: type check, build, offline sample verifier, 166 tests (27 media tests), 0 failures, git diff whitespace check. No paid API or Apify request. Changes remain local on codex/issue15-description-export-2026-11-12; no new commit, push or Issue comment was made in this follow-up.

## Supplied-page completion — 2026-11-12

The user supplied nine saved HTML files, including the seven previously missing source inputs. All source URLs validated. The Reddit file hash is unchanged from its prior 46-readable-comment review. Full replay now exports 105/105 original descriptions across nine sources (83 previously null fields filled), with complete:true, ready_for_delivery:true and zero missing descriptions. Unknown dates/addresses and source count discrepancies remain explicitly qualified. Infatuation dim-sum title says 11 but validated body/structured cards contain 15; retain all 15. Saved files remain private; no paid collection or fresh network capture. This supersedes the initial supplied-only diagnostic above. This completion supersedes the original 83-null delivery; final commit and validation are referenced in the updated Issue #15 handoff.

Completion validation: type check, build, offline verifier and whitespace check passed; 166 tests passed, zero failed. Every paragraph of all 105 descriptions matched text in its corresponding supplied HTML. The new cuisine directory swaps Three Hot Pot / 99 Favor Taste positions; retained the new saved-page order, with six-target membership counts unchanged. Publication and the updated Issue handoff are authorized by the user; exact final commit is linked from the Issue.

Final integrated baseline: rebased onto main 8691c17 (#13 restaurant introductions) with no conflicts. Type check, build and offline sample verification passed; 169 tests passed, zero failed, including 27 media tests. The 166-test results above describe the pre-integration baseline. Only Issue #15 files changed in the follow-up commit; private raw HTML remains ignored.
