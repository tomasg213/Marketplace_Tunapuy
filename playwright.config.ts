import { defineConfig, devices } from "@playwright/test";

// Smoke E2E (docs/architecture.md §6.2): levanta build+start contra la BD
// seedeada en DATA_MODE=mock y valida la home de la vitrina.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // el build de Next puede tardar
  },
});
