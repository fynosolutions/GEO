import { existsSync, mkdirSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
const require = createRequire(import.meta.url),
  readme = path.resolve("database/migrations/meta/README.md"),
  temporary = path.resolve(".local/migration-readme-" + randomUUID() + ".md");
mkdirSync(path.dirname(temporary), { recursive: true });
function restore() {
  if (existsSync(temporary)) renameSync(temporary, readme);
}
// Drizzle parses every file under meta/ as JSON. Keep the required directory
// documentation intact while allowing the generator to inspect snapshots.
if (existsSync(readme)) renameSync(readme, temporary);
try {
  const bin = path.join(
    path.dirname(require.resolve("drizzle-kit")),
    "bin.cjs",
  );
  const result = spawnSync(
    process.execPath,
    [bin, "generate", ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  restore();
}
