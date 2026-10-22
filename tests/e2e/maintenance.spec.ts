// Maintenance mode: a second production server runs with MAINTENANCE_MODE=on (playwright.config.ts).
import { expect, test } from "@playwright/test";
import { watchCsp } from "./helpers";

const base = `http://127.0.0.1:${Number(process.env.E2E_MAINTENANCE_PORT ?? 3101)}`;

test("every storefront page answers 503 with Retry-After and the localised maintenance page", async ({ request }) => {
  for (const [path, lang] of [["/", "bn-Latn"], ["/cart", "bn-Latn"], ["/en", "en"], ["/en/c/kitchen", "en"]] as const) {
    const r = await request.get(`${base}${path}`);
    expect(r.status(), path).toBe(503);
    expect(r.headers()["retry-after"]).toBe("600");
    expect(r.headers()["cache-control"]).toBe("no-store");
    expect(r.headers()["content-security-policy"]).toContain("'nonce-");
    expect(await r.text()).toContain(`<html lang="${lang}"`);
  }
});

test("the maintenance page renders with no CSP violations", async ({ page, browserName }) => {
  // WebKit applies upgrade-insecure-requests to http://127.0.0.1; this server has no HTTPS front,
  // and the page loads only a font, so it is checked in Chromium and Firefox.
  test.skip(browserName === "webkit", "maintenance server is HTTP only; WebKit would upgrade the font request");
  const violations = await watchCsp(page);
  const response = await page.goto(`${base}/en`);
  expect(response?.status()).toBe(503);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Down for maintenance");
  await page.waitForLoadState("networkidle");
  expect(await violations()).toEqual([]);
});

test("health still answers during maintenance and reports it", async ({ request }) => {
  const r = await request.get(`${base}/api/health`);
  expect(r.status()).toBe(200);
  expect((await r.json()).maintenance).toBe(true);
});
