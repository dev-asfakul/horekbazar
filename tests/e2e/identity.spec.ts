// B3 identity pages on a production build with zero variables: no database, so accounts cannot work and
// every identity page shows the shared setup-required state instead of a form that would fail. Private
// pages redirect to sign-in at the proxy. The Better Auth API answers only the Google callback.
import { expect, test } from "@playwright/test";
import { watchCsp } from "./helpers";

for (const path of ["/login", "/register", "/forgot-password", "/en/login", "/en/register"]) {
  test(`${path} shows setup-required, not a dead form`, async ({ page }) => {
    const violations = await watchCsp(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main#main [data-state='setup-required']")).toBeVisible();
    await expect(page.locator("form input[type='password']")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
  });
}

for (const [path, login] of [
  ["/account", "/login?next=%2Faccount"],
  ["/account/security", "/login?next=%2Faccount%2Fsecurity"],
  ["/en/account", "/en/login?next=%2Fen%2Faccount"],
  // Phase F (D28): /checkout is open to guests; the signed-in success page still asks for an account.
  ["/checkout/success/HB-261025-ABC123", "/login?next=%2Fcheckout%2Fsuccess%2FHB-261025-ABC123"],
] as const) {
  test(`${path} without a session redirects to ${login}`, async ({ request }) => {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status()).toBe(307);
    expect(r.headers()["location"]).toBe(login);
  });
}

test("the auth API exposes only the Google callback", async ({ request }) => {
  for (const path of ["/api/auth/sign-up/email", "/api/auth/sign-in/email", "/api/auth/get-session", "/api/auth/two-factor/enable"]) {
    const post = await request.post(path, { data: {} });
    expect(post.status(), `POST ${path}`).toBe(404);
  }
  const callback = await request.get("/api/auth/callback/google");
  expect([302, 307, 400, 404, 503]).toContain(callback.status());
});
