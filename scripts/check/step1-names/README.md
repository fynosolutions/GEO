# Issue #19 name comparison

From the repository root, run with Node.js 24.14 or newer.

```powershell
node scripts/check/step1-names/generate.mjs --input "out/information/batches/2026-11-18T08-31-26-751Z - Collect Information"
```

Change `--input` to any Collect Information batch. The generator reads all JSON files directly inside that directory and accepts any positive number of restaurants. Relative paths resolve from the repository root. Absolute paths are also accepted. The command writes `samples/step1-names/names.json` atomically after validating every input. Invalid input exits with code 1.

`stores.json` supplies preferred identifiers for known Google place IDs. Five identifiers use the Issue #14 store labels. New restaurants use their complete Google name as `store`. New same-name branches include their Google place ID in the identifier. Only restaurants actually present in the input are emitted. The generator identifies restaurants from their Google listing URL, allowing source filenames and names to change between batches.

Each store receives one row for every platform present anywhere in the batch. Missing platform records produce null name/comparison fields with a reason. Successful records require `found: true`, `matched: true` and a non-empty name. Input names and errors retain their source text.

Comparisons ignore case, Unicode punctuation and whitespace. Parenthetical text and branch subtitles remain part of the comparison. Chinese-name extraction uses Han text segments from the full Google name. Reservation records already present in the batch are retained.
