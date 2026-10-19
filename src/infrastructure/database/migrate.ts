import path from "node:path";
import { existsSync } from "node:fs";
import { openDatabase } from "./connection";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const c = openDatabase(
  path.resolve(process.env.GEOBASE_DATA_DIR || ".local/geobase"),
);
console.log("Database migrations complete.");
c.native.close();
