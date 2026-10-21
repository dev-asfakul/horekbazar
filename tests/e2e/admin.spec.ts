// Admin in a production build (B2). Staff identity does not exist until B3, so /admin/health is a
// designed 403 naming the capability, with private headers. The developer view is checked on a
// `next dev` server (docs/PROGRESS.md, B2 evidence), never opened in production.
import { expect, test } from "@playwright/test";
import { watchCsp } from "./helpers";

test("/admin/health answers 403 naming platform.read, private and not indexed", async ({ page }) => {
  const violations = await watchCsp(page);
  const response = await page.goto("/admin/health");
  expect(response?.status()).toBe(403);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toContain("unsafe-inline");
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("এই পাতাটি দেখার অনুমতি আপনার নেই");
  await expect(page.locator("main#main")).toContainText("platform.read");
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  // No integration detail leaks into the denied page.
  await expect(page.locator("body")).not.toContainText("MONGODB_URI");
  await expect(page.locator(".bottom-dock")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(await violations()).toEqual([]);
});

test("unbuilt admin paths are a designed 404, not Next's default", async ({ page }) => {
  for (const path of ["/admin", "/admin/orders"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("পাতাটি পাওয়া যায়নি");
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  }
});

test("/admin is not locale-prefixed: /en/admin/health is a storefront 404", async ({ request }) => {
  expect((await request.get("/en/admin/health")).status()).toBe(404);
});

test("job drain refuses requests while CRON_SECRET is not configured", async ({ request }) => {
  const r = await request.post("/api/jobs/drain", { headers: { authorization: "Bearer anything-at-all-123456" } });
  expect(r.status()).toBe(503);
  expect(await r.json()).toEqual({ error: "not_configured" });
  expect(r.headers()["cache-control"]).toBe("no-store");
  expect((await request.get("/api/jobs/drain")).status()).toBe(405);
});
