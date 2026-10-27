import "dotenv/config";
import { defineConfig } from "@playwright/test";

// Run `npm run build` first. The tests start the built store on port 3100, plus a second copy on
// port 3101 whose database address is deliberately wrong (for the "database unreachable" edges).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3100",
    trace: "off",
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: "npx next start -p 3100",
      url: "http://localhost:3100/help",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx next start -p 3101",
      url: "http://localhost:3101/help",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { DATABASE_URL: "postgres://localhost:1/nonexistent" },
    },
  ],
});
