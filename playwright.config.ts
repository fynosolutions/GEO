import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3137",
    headless: true,
    locale: "en-US",
    channel: process.platform === "win32" ? "msedge" : undefined,
  },
  webServer: {
    command:
      process.env.GEOBASE_E2E_PRODUCTION === "1"
        ? "npm run start -- --port 3137"
        : "npm run dev -- --port 3137",
    url: "http://127.0.0.1:3137",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      GEOBASE_DATA_DIR: ".local/e2e-us-data",
      GEOBASE_BACKUP_DIR: ".local/e2e-us-backups",
    },
  },
});
