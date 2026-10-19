import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/infrastructure/database/schema.ts",
  out: "./database/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.GEOBASE_DATA_DIR
      ? process.env.GEOBASE_DATA_DIR + "/geobase.db"
      : ".local/geobase/geobase.db",
  },
});
