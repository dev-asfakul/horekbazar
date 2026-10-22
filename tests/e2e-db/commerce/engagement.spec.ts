// B9 engagement journeys in a browser against the disposable database: a customer starts a
// conversation with the store and sees the reply; another customer gets the not-found page for it;
// a support agent (messages.reply only) answers it but cannot open the review or rewards pages; the
// customer review and rewards pages show not-found while those features are off (the default).
// Strict CSP throughout.
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { MongoClient, type Db } from "mongodb";
import { createAuth } from "@/lib/modules/identity/auth";
import { watchCsp } from "../../e2e/helpers";

const ALICE = { email: "e2e.msg.alice@example.test", password: "e2e-only-password-21", name: "আলিয়া রহমান" };
const BOB = { email: "e2e.msg.bob@example.test", password: "e2e-only-password-22", name: "বাবুল মিয়া" };
const SUPPORT = { email: "e2e.msg.support@example.test", password: "e2e-only-password-23", name: "E2E Messages Support" };

let client: MongoClient;
let db: Db;
let auth: ReturnType<typeof createAuth>;
let baseURL: string;

// Account pages stream behind loading.tsx, so notFound() renders the not-found page with HTTP 200
// (same as /account/orders/[orderNumber] on main). Assert what the visitor actually gets.
async function expectNotFound(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "পেজটি পাওয়া যায়নি" })).toBeVisible();
}

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
  for (const [u, role] of [[ALICE, null], [BOB, null], [SUPPORT, "support_agent"]] as const) {
    if (!(await db.collection("user").findOne({ email: u.email }))) await auth.api.signUpEmail({ body: { name: u.name, email: u.email, password: u.password } });
    await db.collection("user").updateOne({ email: u.email }, { $set: { emailVerified: true, ...(role ? { staffRoleKey: role } : {}) } });
  }
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
});

test.afterAll(async () => {
  await client?.close();
});

test("customer asks the store, support answers, nobody else can read it", async ({ browser }) => {
  const settings = await db.collection("settings").findOne({ _id: "settings" } as never);
  expect(settings?.features?.reviews ?? false).toBe(false);
  expect(settings?.features?.rewards ?? false).toBe(false);

  const alice = await browser.newContext();
  const page = await alice.newPage();
  const csp = await watchCsp(page);
  await signIn(alice, ALICE);
  // Off by default: the pages do not exist.
  await expectNotFound(page, "/bn/account/reviews");
  await expect(page.getByTestId("reviewable")).toHaveCount(0);
  await expectNotFound(page, "/bn/account/rewards");
  await expect(page.getByTestId("rewards-balance")).toHaveCount(0);

  await page.goto("/bn/account/messages");
  const subject = `ডেলিভারি সময় ${Date.now()}`;
  const form = page.getByTestId("new-conversation");
  await form.locator('[name="subject"]').fill(subject);
  await form.locator('[name="body"]').fill("আমার অর্ডার কবে আসবে?");
  await form.locator('button[type="submit"]').click();
  await page.waitForURL(/\/account\/messages\/[a-f0-9]{24}$/);
  const threadUrl = new URL(page.url()).pathname;
  await expect(page.getByTestId("thread").locator('[data-from="customer"]')).toHaveCount(1);

  // Another customer cannot open it, nor learn that it exists.
  const bob = await browser.newContext();
  const bobPage = await bob.newPage();
  await signIn(bob, BOB);
  await expectNotFound(bobPage, threadUrl);
  await expect(bobPage.getByTestId("thread")).toHaveCount(0);
  await expect(bobPage.getByText("আমার অর্ডার কবে আসবে?")).toHaveCount(0);
  await bobPage.goto("/bn/account/messages");
  await expect(bobPage.getByText(subject)).toHaveCount(0);
  await bob.close();

  // Support agent: messages yes, reviews and rewards no.
  const staff = await browser.newContext();
  const staffPage = await staff.newPage();
  const staffCsp = await watchCsp(staffPage);
  await signIn(staff, SUPPORT);
  expect((await staffPage.goto("/admin/reviews"))?.status()).toBe(403);
  expect((await staffPage.goto("/admin/rewards"))?.status()).toBe(403);
  expect((await staffPage.goto("/admin/messages"))?.status()).toBe(200);
  await staffPage.getByRole("link", { name: subject }).click();
  await expect(staffPage.getByTestId("admin-conversation")).toBeVisible();
  const reply = staffPage.getByTestId("staff-reply");
  await reply.locator('[name="body"]').fill("Tomorrow before noon.");
  await reply.locator('button[type="submit"]').click();
  await expect(staffPage.getByTestId("thread").locator('[data-from="staff"]')).toHaveCount(1);
  expect(await staffCsp()).toEqual([]);
  await staff.close();

  await page.reload();
  await expect(page.getByTestId("thread").locator('[data-from="staff"]')).toContainText("Tomorrow before noon.");
  const conv = (await db.collection("conversations").findOne({ subject }))!;
  expect(conv).toMatchObject({ unreadByCustomer: 0, unreadByStaff: 0, messageCount: 2, status: "open" });
  expect(await csp()).toEqual([]);
  await alice.close();
});
