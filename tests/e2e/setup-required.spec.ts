// Smoke test on a production build started with zero environment variables (B0, updated in B1).
import { expect, test } from "@playwright/test";

test("Bengali home at / shows setup-required with a nonce CSP and no violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toContain("unsafe-inline");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");

  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("সেটআপ প্রয়োজন");
  await expect(page.locator("main#main [data-state='setup-required']")).toContainText("MONGODB_URI");
  await expect(page.locator("#setup-required")).toHaveCount(1);

  // Every script Next.js emitted carries the request's nonce.
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  const scriptNonces = await page.locator("script").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).nonce));
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(scriptNonces.every((n) => n === nonce)).toBe(true);

  await page.waitForLoadState("networkidle");
  const pageViolations = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  expect([...violations, ...pageViolations]).toEqual([]);
});

test("each request gets a fresh nonce", async ({ request }) => {
  const a = (await request.get("/")).headers()["content-security-policy"];
  const b = (await request.get("/")).headers()["content-security-policy"];
  expect(a).not.toBe(b);
});

test("English at /en shows setup-required in English", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Setup required");
});

test("/bn redirects to the canonical / with 308", async ({ request }) => {
  const r = await request.get("/bn", { maxRedirects: 0 });
  expect(r.status()).toBe(308);
  expect(new URL(r.headers()["location"] ?? "", "http://x").pathname).toBe("/");
});

test("an unknown top-level locale-like segment is a 404, not a page", async ({ request }) => {
  expect((await request.get("/fr")).status()).toBe(404);
});

test("/api/health reports setup-required without claiming a database connection", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  expect(r.headers()["cache-control"]).toContain("no-store");
  expect(await r.json()).toEqual({ status: "ok", setupRequired: true, maintenance: false, checks: { database: "not_configured" } });
});

test("a client-sent internal-rewrite header cannot bypass the /bn redirect", async ({ request }) => {
  const r = await request.get("/bn", { maxRedirects: 0, headers: { "x-hb-internal-rewrite": "guess" } });
  expect(r.status()).toBe(308);
});
