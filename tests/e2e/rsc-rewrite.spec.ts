// C-02 (vercel/next.js#100398, workaround in scripts/patch-next-empty-rsc.mjs): the request Next makes
// after a Server Action's redirect() — RSC with an empty `_rsc=` — must be served on rewritten Bangla
// paths instead of bouncing 307 "/bn/x?_rsc" ↔ 308 "/x". Ordinary navigation, the canonical "/bn"
// redirect and Next's cache-busting check (a missing or wrong `_rsc` is still redirected) are unchanged.
// HTTP-level, so it runs once (Chromium), not per engine.
import { expect, test } from "@playwright/test";

test.describe("RSC requests through the locale rewrite (C-02)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "HTTP-level; runs once (Chromium)");

  const rsc = { RSC: "1" };

  for (const path of ["/", "/terms", "/privacy-policy"]) {
    test(`empty _rsc on ${path} (Bangla, rewritten) is served, not redirected`, async ({ request }) => {
      const res = await request.get(`${path}?_rsc`, { headers: rsc, maxRedirects: 0 });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/x-component");
      expect(res.headers()["location"]).toBeUndefined();
    });
  }

  test("empty _rsc on an English path (no rewrite) is served", async ({ request }) => {
    const res = await request.get("/en/terms?_rsc", { headers: rsc, maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/x-component");
  });

  test("ordinary navigation is unchanged: HTML, no redirect", async ({ request }) => {
    for (const path of ["/", "/terms", "/en/terms"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toContain("text/html");
    }
  });

  test("the canonical /bn redirect is unchanged", async ({ request }) => {
    for (const [from, to] of [["/bn", "/"], ["/bn/terms", "/terms"], ["/bn/terms?x=1", "/terms?x=1"]] as const) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(new URL(res.headers()["location"]!, "http://h").pathname + new URL(res.headers()["location"]!, "http://h").search, from).toBe(to);
    }
  });

  test("Next's cache-busting check still redirects a missing or wrong _rsc (not served from the bad URL)", async ({ request }) => {
    for (const url of ["/terms", "/terms?_rsc=wrong0"]) {
      const res = await request.get(url, { headers: rsc, maxRedirects: 0 });
      expect(res.status(), url).toBe(307);
      expect(res.headers()["location"], url).toMatch(/[?&]_rsc(=|$)/);
    }
  });

  test("a client-side navigation between Bangla pages makes no redirected request", async ({ page }) => {
    const redirected: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 300 && r.status() < 400) redirected.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const link = page.locator('footer a[href="/terms"]').first();
    await link.click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.locator("h1")).toBeVisible();
    expect(redirected).toEqual([]);
  });
});
