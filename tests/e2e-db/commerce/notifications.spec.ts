// B9 part 2 notification journeys in a browser against the disposable database (push configured
// with throwaway keys by scripts/e2e-db-server.mjs; no worker runs, so nothing is delivered):
// - a customer's notifications page never asks for browser permission on load, offers start
//   unticked, and a refused permission shows the blocked state;
// - a marketing manager sends a campaign, which is queued only for the browser that ticked offers;
// - a support agent cannot open the page. Strict CSP throughout.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { createAuth } from "@/lib/modules/identity/auth";
import { watchCsp } from "../../e2e/helpers";

const CAROL = { email: "e2e.push.carol@example.test", password: "e2e-only-password-31", name: "করিম হাসান" };
const MARKETER = { email: "e2e.push.marketer@example.test", password: "e2e-only-password-32", name: "E2E Marketing Manager" };
const SUPPORT = { email: "e2e.push.support@example.test", password: "e2e-only-password-33", name: "E2E Push Support" };

let client: MongoClient;
let db: Db;
let auth: ReturnType<typeof createAuth>;
let baseURL: string;

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
  for (const [u, role] of [[CAROL, null], [MARKETER, "marketing_manager"], [SUPPORT, "support_agent"]] as const) {
    if (!(await db.collection("user").findOne({ email: u.email }))) await auth.api.signUpEmail({ body: { name: u.name, email: u.email, password: u.password } });
    await db.collection("user").updateOne({ email: u.email }, { $set: { emailVerified: true, ...(role ? { staffRoleKey: role } : {}) } });
  }
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
});

test.afterAll(async () => {
  await client?.close();
});

test("customer: no permission prompt on load, offers start unticked, a refused permission shows blocked", async ({ browser }) => {
  const context = await browser.newContext();
  // Count permission requests and refuse them, as a customer pressing "Block" would.
  await context.addInitScript(() => {
    const w = window as unknown as { __permissionAsks: number };
    w.__permissionAsks = 0;
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "default" });
    Notification.requestPermission = async () => {
      w.__permissionAsks++;
      return "denied";
    };
  });
  const page = await context.newPage();
  const csp = await watchCsp(page);
  await signIn(context, CAROL);
  await page.goto("/en/account/notifications");
  await expect(page.getByTestId("push-opt-in")).toBeVisible();
  await expect(page.getByTestId("push-state")).toHaveText("Off on this browser.");
  await expect(page.getByLabel("Order updates")).toBeChecked();
  await expect(page.getByTestId("push-marketing")).not.toBeChecked();
  expect(await page.evaluate(() => (window as unknown as { __permissionAsks: number }).__permissionAsks)).toBe(0);
  await page.getByTestId("push-turn-on").click();
  await expect(page.getByTestId("push-blocked")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __permissionAsks: number }).__permissionAsks)).toBe(1);
  const carol = await db.collection("user").findOne({ email: CAROL.email });
  expect(await db.collection("pushSubscriptions").countDocuments({ userId: String(carol!._id) })).toBe(0);
  expect(await csp()).toEqual([]);
  await context.close();
});

test("marketing manager sends a campaign only to the browser that ticked offers; support cannot open the page", async ({ browser }) => {
  const now = new Date();
  const sub = (marketing: boolean) => ({ _id: new ObjectId(), userId: `e2e-push-${randomUUID()}`, endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${randomUUID()}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" }, topics: { orders: true, marketing }, ...(marketing ? { consentAt: now, consentSource: "account" } : {}), locale: "bn", createdAt: now, updatedAt: now });
  const optedIn = sub(true);
  await db.collection("pushSubscriptions").insertMany([optedIn, sub(false)] as never[]);
  const audience = await db.collection("pushSubscriptions").countDocuments({ "topics.marketing": true });

  const context = await browser.newContext();
  const page = await context.newPage();
  const csp = await watchCsp(page);
  await signIn(context, MARKETER);
  await page.goto("/admin/notifications");
  await expect(page.getByTestId("admin-notifications")).toBeVisible();
  await expect(page.getByTestId("notify-audience")).toContainText(String(audience));
  const title = `E2E offer ${randomUUID().slice(0, 6)}`;
  const form = page.getByTestId("campaign-create");
  await form.getByLabel("Title (Bangla)").fill(title);
  await form.getByLabel("Message (Bangla)").fill("চাল ১০% কম");
  await form.getByLabel("Opens").fill("/c/rice");
  await form.getByRole("button", { name: "Save draft" }).click();
  await expect(form).toContainText("Draft saved.");
  const draft = page.getByTestId("campaign-draft").filter({ hasText: title });
  await draft.getByTestId("campaign-send").getByRole("button").click();
  await expect(page.getByTestId("campaign-sent").filter({ hasText: title })).toBeVisible();
  const campaign = await db.collection("campaigns").findOne({ "title.bn": title });
  expect(campaign).toMatchObject({ status: "sent", recipients: audience });
  const rows = await db.collection("outbox").find({ type: "push.send", "payload.campaignId": String(campaign!._id) }).toArray();
  expect(rows).toHaveLength(audience);
  expect(rows.map((r) => r.payload.subscriptionId)).toContain(String(optedIn._id));
  expect(rows.every((r) => !("endpoint" in r.payload))).toBe(true);
  expect(await db.collection("auditLog").countDocuments({ action: "campaign.sent", "target.id": String(campaign!._id) })).toBe(1);
  expect(await csp()).toEqual([]);
  await context.close();

  const support = await browser.newContext();
  const sp = await support.newPage();
  await signIn(support, SUPPORT);
  expect((await sp.goto("/admin/notifications"))?.status()).toBe(403);
  await support.close();
});

test("signed out: the notifications page redirects to sign-in", async ({ page }) => {
  await page.goto("/en/account/notifications");
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Faccount%2Fnotifications$/);
});
