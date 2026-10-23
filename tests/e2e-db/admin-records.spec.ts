// B10 part c in a browser against the disposable database: a role with platform.read reads the audit
// log (filters work, personal values stay redacted); a support agent (customers.read) looks a customer
// up but is refused the audit log; an ordinary customer is refused both; a signed-out visitor is sent
// to sign in. Strict CSP throughout.
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { createAuth } from "@/lib/modules/identity/auth";
import { watchCsp } from "../e2e/helpers";

const AUDITOR = { email: "e2e.audit.viewer@example.test", password: "e2e-only-password-31", name: "E2E Audit Viewer" };
const SUPPORT = { email: "e2e.audit.support@example.test", password: "e2e-only-password-32", name: "E2E Records Support" };
const SHOPPER = { email: "e2e.audit.shopper@example.test", password: "e2e-only-password-33", name: "রাশেদা খাতুন" };

let client: MongoClient;
let db: Db;
let auth: ReturnType<typeof createAuth>;
let baseURL: string;
const marker = `e2e-${Date.now()}`;

async function signIn(context: BrowserContext, who: { email: string; password: string }) {
  const res = await auth.api.signInEmail({ body: { email: who.email, password: who.password }, returnHeaders: true });
  const cookies = res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const eq = pair!.indexOf("=");
    return { name: pair!.slice(0, eq), value: pair!.slice(eq + 1), domain: new URL(baseURL).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" as const };
  });
  await context.addCookies(cookies);
}

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string; authSecret: string; baseURL: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  baseURL = info.baseURL;
  auth = createAuth({ db, client, secret: info.authSecret, baseURL, production: true });
  // A custom role holding platform.read without mandatory 2FA, so the journey needs no TOTP device.
  await db.collection("staffRoles").updateOne(
    { key: "e2e_auditor" },
    { $setOnInsert: { key: "e2e_auditor", name: { bn: "অডিটর", en: "Auditor" }, capabilities: ["platform.read"], builtIn: false, twoFactorRequired: false, createdAt: new Date(), updatedAt: new Date() } },
    { upsert: true },
  );
  for (const [u, role] of [[AUDITOR, "e2e_auditor"], [SUPPORT, "support_agent"], [SHOPPER, null]] as const) {
    if (!(await db.collection("user").findOne({ email: u.email }))) await auth.api.signUpEmail({ body: { name: u.name, email: u.email, password: u.password } });
    await db.collection("user").updateOne({ email: u.email }, { $set: { emailVerified: true, ...(role ? { staffRoleKey: role } : {}) } });
  }
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
  await db.collection("auditLog").insertOne({ _id: new ObjectId(), actor: { id: marker, role: "owner" }, action: "customer.updated", target: { type: "user", id: marker }, after: { email: "leak@example.test", status: "ok" }, at: new Date() });
});

test.afterAll(async () => {
  await client?.close();
});

test("platform.read reads the audit log; filters work; personal values stay redacted", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const csp = await watchCsp(page);
  await signIn(ctx, AUDITOR);
  const res = await page.goto("/admin/audit");
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("admin-audit")).toBeVisible();
  await expect(page.locator('nav a[href="/admin/audit"]')).toHaveCount(1);
  await expect(page.locator('nav a[href="/admin/customers"]')).toHaveCount(0);
  await page.getByLabel("Actor id").fill(marker);
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/actor=/);
  await expect(page.getByTestId("audit-row")).toHaveCount(1);
  await page.getByTestId("audit-row").getByText("Changes").click();
  await expect(page.getByTestId("audit-row")).toContainText("[redacted]");
  await expect(page.getByText("leak@example.test")).toHaveCount(0);
  // Malformed filters are ignored, not errors.
  expect((await page.goto("/admin/audit?action=%24where&from=2026-02-30&page=-4"))?.status()).toBe(200);
  // Customers need customers.read, which this role lacks.
  expect((await page.goto("/admin/customers"))?.status()).toBe(403);
  expect(await csp()).toEqual([]);
  await ctx.close();
});

test("support looks a customer up but is refused the audit log", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const csp = await watchCsp(page);
  await signIn(ctx, SUPPORT);
  expect((await page.goto("/admin/audit"))?.status()).toBe(403);
  await page.goto("/admin/customers");
  await expect(page.getByTestId("admin-customers")).toBeVisible();
  await page.getByLabel("Search").fill(SHOPPER.email);
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=/);
  await expect(page.getByTestId("customer-row")).toHaveCount(1);
  // Staff accounts are not listed here.
  await page.goto(`/admin/customers?q=${encodeURIComponent(SUPPORT.email)}`);
  await expect(page.getByTestId("customer-row")).toHaveCount(0);
  await page.goto(`/admin/customers?q=${encodeURIComponent(SHOPPER.email)}`);
  await page.getByTestId("customer-row").getByRole("link").click();
  await expect(page.getByTestId("admin-customer")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(SHOPPER.name);
  // A staff id and a malformed id are both a plain not-found. The section streams behind loading.tsx,
  // so the not-found page arrives with HTTP 200 (same as /admin/orders/[orderNumber]): assert content.
  const staffId = String((await db.collection("user").findOne({ email: SUPPORT.email }))!._id);
  for (const path of [`/admin/customers/${staffId}`, "/admin/customers/not-an-id"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page.getByTestId("admin-customer")).toHaveCount(0);
  }
  expect(await csp()).toEqual([]);
  await ctx.close();
});

test("an ordinary customer is refused both pages; a signed-out visitor is sent to sign in", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(ctx, SHOPPER);
  expect((await page.goto("/admin/audit"))?.status()).toBe(403);
  expect((await page.goto("/admin/customers"))?.status()).toBe(403);
  await ctx.close();
  const anon = await browser.newContext();
  const p2 = await anon.newPage();
  await p2.goto("/admin/audit");
  await expect(p2).toHaveURL(/\/login\?next=%2Fadmin%2Faudit/);
  await p2.goto("/admin/customers");
  await expect(p2).toHaveURL(/\/login\?next=%2Fadmin%2Fcustomers/);
  await anon.close();
});

test("customer: wrong password refused; export downloads once; deletion request is idempotent, visible to support, and withdrawable", async ({ browser }) => {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const csp = await watchCsp(page);
  await signIn(ctx, SHOPPER);
  expect((await page.goto("/account/privacy"))?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByTestId("privacy-retention")).toContainText("[NEEDS COPY]");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // Wrong password: refused, nothing prepared.
  const exportForm = page.getByTestId("privacy-export-form");
  await exportForm.getByLabel("পাসওয়ার্ড").fill("not-the-password");
  await exportForm.getByRole("button", { name: "ডাউনলোড তৈরি করুন" }).click();
  await expect(exportForm.getByText("পাসওয়ার্ড ঠিক নয়").first()).toBeVisible();
  await expect(page.getByTestId("privacy-export-ready")).toHaveCount(0);

  // Right password: a single-use link.
  await exportForm.getByLabel("পাসওয়ার্ড").fill(SHOPPER.password);
  await exportForm.getByRole("button", { name: "ডাউনলোড তৈরি করুন" }).click();
  await expect(page.getByTestId("privacy-export-ready")).toBeVisible();
  const href = (await page.getByTestId("privacy-download").getAttribute("href"))!;
  // Another signed-in customer cannot use it.
  const other = await browser.newContext();
  await signIn(other, SUPPORT);
  const stolen = await other.request.get(href, { maxRedirects: 0 });
  expect(stolen.status()).toBe(303);
  expect(stolen.headers()["location"]).toContain("export=invalid");
  await other.close();
  // The owner downloads it once.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("privacy-download").click()]);
  const body = JSON.parse(await (await import("node:fs/promises")).readFile((await download.path())!, "utf8")) as { format: string; account: { email: string } };
  expect(body.format).toBe("horekbazar-account-export");
  expect(body.account.email).toBe(SHOPPER.email);
  expect(JSON.stringify(body)).not.toMatch(/"password"|"token"/);
  // Used: the same link now lands on the "no longer works" notice.
  await page.goto(href);
  await expect(page.getByTestId("privacy-export-invalid")).toBeVisible();

  // Deletion request needs the tick and the password.
  const del = page.getByTestId("privacy-deletion-form");
  await del.getByLabel("পাসওয়ার্ড").fill(SHOPPER.password);
  await del.getByLabel("আমি বুঝেছি, অনুরোধটি পাঠাতে চাই").check();
  await del.getByRole("button", { name: "অনুরোধ পাঠান" }).click();
  await expect(page.getByTestId("privacy-deletion-open")).toBeVisible();
  const userId = String((await db.collection("user").findOne({ email: SHOPPER.email }))!._id);
  expect(await db.collection("privacyRequests").countDocuments({ userId, kind: "deletion", status: "received" })).toBe(1);
  expect(await db.collection("user").countDocuments({ email: SHOPPER.email })).toBe(1);

  // Support sees it on /admin/customers.
  const staff = await browser.newContext();
  const sp = await staff.newPage();
  await signIn(staff, SUPPORT);
  await sp.goto("/admin/customers");
  await expect(sp.getByTestId("customer-deletion").filter({ hasText: SHOPPER.email })).toHaveCount(1);
  await staff.close();

  // Withdraw.
  await page.getByTestId("privacy-deletion-cancel").getByRole("button", { name: "অনুরোধ ফিরিয়ে নিন" }).click();
  await expect(page.getByTestId("privacy-deletion-form")).toBeVisible();
  expect(await db.collection("privacyRequests").countDocuments({ userId, kind: "deletion", status: "received" })).toBe(0);
  expect(await csp()).toEqual([]);
  await ctx.close();

  // Signed out: sent to sign in; the download route gives nothing away.
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto("/account/privacy");
  await expect(ap).toHaveURL(/\/login/);
  const r = await anon.request.get(href, { maxRedirects: 0 });
  expect(r.status()).toBe(303);
  await anon.close();
});
