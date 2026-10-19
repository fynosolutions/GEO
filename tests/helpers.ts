import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { openDatabase } from "../src/infrastructure/database/connection";
import { createRepository } from "../src/infrastructure/database/repository";
import { createAssetStore } from "../src/infrastructure/storage/assets";
import {
  createMerchantService,
  type Result,
  type Profile,
  type Value,
} from "../src/modules/merchant/public";
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok)
    throw new Error(result.error.code + ": " + result.error.message);
  return result.data;
}
export function fixture() {
  const base = path.resolve(".local/tests");
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(path.join(base, "case-")),
    root = path.join(dir, "data"),
    backups = path.join(dir, "backups"),
    connection = openDatabase(root),
    repository = createRepository(connection),
    assets = createAssetStore(root);
  let tick = 0;
  const service = createMerchantService({
    repository,
    assets,
    clock: () => new Date(Date.UTC(2026, 9, 19, 1, 0, tick++)),
  });
  return {
    dir,
    root,
    backups,
    connection,
    repository,
    assets,
    service,
    cleanup() {
      connection.native.close();
      const resolved = path.resolve(dir);
      if (!resolved.startsWith(base + path.sep))
        throw new Error("Test cleanup outside workspace");
      rmSync(resolved, { recursive: true, force: true });
    },
  };
}
export const merchantInput = {
  display_name: "Sample Juniper Table",
  region: "Austin, TX",
  address: "100 Example St (fictional)",
  primary_cuisines: ["New American"],
  brand_id: null,
  timezone: "America/Chicago",
  city: "Austin",
  state: "TX",
  postal_code: "78701",
};
export const known = <T extends Value>(value: T) => ({
  value_state: "known" as const,
  value,
});
export const hours = () =>
  Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    mode: "periods" as const,
    periods: [{ start: "17:00", end: "02:00", end_day_offset: 1 as const }],
  }));
