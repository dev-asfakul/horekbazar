// Playwright, signed-in admin journeys (B4): the production build backed by a disposable in-memory
// replica set (scripts/e2e-db-server.mjs). Chromium only — the zero-env suite (playwright.config.ts)
// covers the three engines; this one proves that real catalogue CRUD works end to end in a browser.
// localhost is a secure context, so the production Secure session cookie works over http here.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_DB_PORT ?? 3200);

export default defineConfig({
  testDir: "tests/e2e-db",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/e2e-db-server.mjs",
    env: { E2E_DB_PORT: String(PORT) },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
