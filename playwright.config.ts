// Playwright: runs against a local production build (`npm run build` first), started with zero
// environment variables apart from the port. Three browser engines. WebKit goes through a
// test-only HTTPS proxy (scripts/e2e-https-proxy.mjs) because the production CSP sends
// upgrade-insecure-requests (D17 condition); the CSP itself is never weakened for tests.
// A second server runs with MAINTENANCE_MODE=on for the maintenance checks.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const HTTPS_PORT = Number(process.env.E2E_HTTPS_PORT ?? 3443);
const MAINTENANCE_PORT = Number(process.env.E2E_MAINTENANCE_PORT ?? 3101);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: [
    {
      command: "node scripts/start-standalone.mjs",
      env: { PORT: String(PORT), HOSTNAME: "127.0.0.1" },
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node scripts/e2e-https-proxy.mjs",
      env: { E2E_PORT: String(PORT), E2E_HTTPS_PORT: String(HTTPS_PORT) },
      url: `https://127.0.0.1:${HTTPS_PORT}/api/health`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node scripts/start-standalone.mjs",
      env: { PORT: String(MAINTENANCE_PORT), HOSTNAME: "127.0.0.1", MAINTENANCE_MODE: "on" },
      url: `http://127.0.0.1:${MAINTENANCE_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"], baseURL: `https://127.0.0.1:${HTTPS_PORT}`, ignoreHTTPSErrors: true } },
  ],
});
