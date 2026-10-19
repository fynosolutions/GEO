import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
export function openDatabase(root: string) {
  mkdirSync(root, { recursive: true });
  const native = new Database(path.join(root, "geobase.db"));
  native.pragma("foreign_keys = ON");
  native.pragma("journal_mode = WAL");
  native.pragma("busy_timeout = 5000");
  const db = drizzle(native);
  migrate(db, { migrationsFolder: path.resolve("database/migrations") });
  return { native, db };
}
export type Connection = ReturnType<typeof openDatabase>;
