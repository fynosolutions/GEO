# Issue #19 · Platform restaurant names

[names.json](names.json) contains eight restaurants × ten platforms, one record per combination. It uses the supplied Collect Information batch as its source.

Generate this file from a batch directory with the offline script.

```powershell
node scripts/check/step1-names/generate.mjs --input "out/information/batches/2026-11-18T08-31-26-751Z - Collect Information"
```

The input path can be changed for subsequent batches. Relative input paths resolve from the repository root. See [generator instructions](../../scripts/check/step1-names/README.md).

Source directory relative to the repository root is `out/information/batches/2026-11-18T08-31-26-751Z - Collect Information/`.

## Field rules

- `store` uses 020 for Easy Joy, 001 for Frydom Express and 004 for Bao Noodle House. The other five identifiers match the original restaurant labels in `samples/step1-reviews/stores.json` for Issue #14.
- `name` retains the source string when both `found` and `matched` are true and a name is present.
- `has_chinese` checks for Han characters in that name. `google_chinese_name` retains the Chinese portion of the Google name. Restaurants whose Google name has no Chinese use null.
- `same_as_google` compares the complete names after lowercasing and removing Unicode punctuation and whitespace. Text inside parentheses and branch subtitles participates in the comparison. Symbols, digits and wording are preserved for comparison.
- A missing or rejected source record uses null for `name`, `has_chinese` and `same_as_google`, with the source error in `note`.
- Reservation platforms retain the batch records. Missing reservation records are labelled deferred, following Issue #19.

## Validation

Verified 80 unique store/platform combinations, source name fidelity, eight Google baselines, Chinese-name extraction and all comparisons. The result contains 34 usable names, 15 matching names, 19 differing names and 46 records with unavailable names.

## Names differing from Google

| Store | Platforms with same_as_google false |
| --- | --- |
| 020 | yelp, tripadvisor, doordash, uber_eats, grubhub, facebook |
| LaoJie Hotpot | yelp, uber_eats, grubhub |
| 99 Favor Taste | yelp, facebook |
| The Dolar Shop Hot Pot | yelp, tripadvisor, facebook |
| Shoo Loong Kan Hot Pot 小龙坎 | instagram |
| KPOT Korean BBQ & Hot Pot | uber_eats, facebook |
| 001 | uber_eats |
| 004 | facebook |

## Source SHA-256

| Source file | SHA-256 |
| --- | --- |
| Easy Joy (Hot Pot, BBQ Skewers, Dim Sum) 意中人火锅烧烤点心.json | 00b40b4ccdeb6776b7df123110ceb5766c830e0067ab47ecef062c1b68417424 |
| LaoJie Hotpot.json | 3e0dfc71390577db025d393623a642bffa0c5a13d563a6553830adaaf9474251 |
| 99 Favor Taste.json | 858071e1b5b48c1155d52017e548ec9a9c8ee546d667bc8413ba1582caee7f63 |
| The Dolar Shop Hot Pot Manhattan.json | 1a9abecd3e155663b59fb779494d192c10366d7f7fc381301cdfb2b3890f197a |
| Shoo Loong Kan Hot Pot Manhattan 小龙坎火锅.json | 707b44e7dcdf02714194fb27c65e07484c3d27781f5d82b3e50f16086be07f06 |
| KPOT Korean BBQ & Hot Pot.json | 3cfa5862e86e7291d4a8c13bb024f5fbdfa91aeae34f19faa052dbc674960a6b |
| Frydom Express.json | 52ba702e7fdf410abeb0a15f9df62e769614abf26f30c0d7c297efbf36fa9186 |
| Bao Noodle House 包之面.json | b8f609a358767187a0732a8a109638d2d10e4a3a33ed10e22d3679bbe8d342f3 |

[Issue #19](https://github.com/fynosolutions/GEO/issues/19)
