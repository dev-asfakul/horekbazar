// Admin in a production build started with zero variables (B2, updated in B3). Without a session
// cookie every admin page except /admin/setup redirects to sign-in at the proxy; the setup page lists
// what is missing by name, never by value. Signed-in flows are covered by tests/integration/identity.test.ts.
import { expect, test } from "@playwright/test";
import { watchCsp } from "./helpers";

const B4_PAGES = ["/admin/products", "/admin/products/new", "/admin/products/66f0c0ffee0000000000abcd", "/admin/categories", "/admin/inventory", "/admin/collections", "/admin/homepage", "/admin/banners", "/admin/settings", "/admin/settings/delivery"];

for (const path of ["/admin", "/admin/health", "/admin/staff", "/admin/security", "/admin/orders", ...B4_PAGES]) {
  test(`${path} without a session redirects to sign-in, uncached`, async ({ request }) => {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers()["location"]).toBe(`/login?next=${encodeURIComponent(path)}`);
    expect(r.headers()["cache-control"]).toBe("no-store");
    expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
}

test("a forged session cookie still cannot open an admin page (server re-checks)", async ({ request }) => {
  const r = await request.get("/admin/health", { maxRedirects: 0, headers: { cookie: "hb.session_token=forged.value" } });
  expect(r.status()).toBe(307);
  expect(r.headers()["location"]).toBe("/login?next=%2Fadmin%2Fhealth");
});

test("/admin/setup lists what is missing, private and not indexed", async ({ page }) => {
  const violations = await watchCsp(page);
  const response = await page.goto("/admin/setup");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("স্টোরের মালিক ঠিক করুন");
  const blockers = page.getByTestId("setup-blockers");
  await expect(blockers.locator("[data-blocker='database']")).toContainText("MONGODB_URI");
  await expect(blockers.locator("[data-blocker='auth_secret']")).toContainText("AUTH_SECRET");
  await expect(blockers.locator("[data-blocker='site_url']")).toContainText("NEXT_PUBLIC_SITE_URL");
  await expect(blockers.locator("[data-blocker='email']")).toContainText("RESEND_API_KEY");
  await expect(blockers.locator("[data-blocker='setup_token']")).toContainText("SETUP_TOKEN");
  await expect(blockers).not.toContainText("://"); // names only, never values
  await expect(page.getByTestId("setup-form")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".bottom-dock")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(await violations()).toEqual([]);
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

test("media upload signing: cross-origin is refused, signed-out is 401, never a signature", async ({ request, baseURL }) => {
  const cross = await request.post("/api/media/sign", { data: { purpose: "product" }, headers: { origin: "https://evil.example" } });
  expect(cross.status()).toBe(403);
  expect(await cross.json()).toEqual({ error: "cross_origin" });
  const noOrigin = await request.post("/api/media/sign", { data: { purpose: "product" } });
  expect(noOrigin.status()).toBe(403);
  const origin = new URL(baseURL!).origin;
  const signedOut = await request.post("/api/media/sign", { data: { purpose: "product" }, headers: { origin } });
  expect(signedOut.status()).toBe(401);
  expect(signedOut.headers()["cache-control"]).toBe("no-store");
  const body = await signedOut.text();
  expect(body).not.toMatch(/signature|api_key/i);
  const bad = await request.post("/api/media/sign", { data: { purpose: "avatar" }, headers: { origin } });
  expect(bad.status()).toBe(400);
});
