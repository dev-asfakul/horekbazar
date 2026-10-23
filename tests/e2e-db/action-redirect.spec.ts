// C-02 (vercel/next.js#100398): a Server Action that calls redirect() on a Bangla (rewritten) path
// answers with the destination's RSC payload in the same response — Next's internal fetch of the
// target succeeded — so the browser lands without a second request and nothing is redirected 3xx.
// Before the workaround the action answered with an empty body (the internal fetch looped 307↔308
// until "redirect count exceeded"), and the browser had to fetch the destination itself.
// English paths (no rewrite) are the control. A failed sign-in stays on the form with no redirect.
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Response } from "@playwright/test";
import { MongoClient, type Db } from "mongodb";
import { createAuth } from "@/lib/modules/identity/auth";

const USER = { email: "e2e.action.redirect@example.test", password: "e2e-only-password-41", name: "নাসরিন আক্তার" };

let client: MongoClient;
let db: Db;

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string; authSecret: string; baseURL: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  const auth = createAuth({ db, client, secret: info.authSecret, baseURL: info.baseURL, production: true });
  if (!(await db.collection("user").findOne({ email: USER.email }))) await auth.api.signUpEmail({ body: USER });
  await db.collection("user").updateOne({ email: USER.email }, { $set: { emailVerified: true } });
});

test.afterAll(async () => {
  await client?.close();
});

/**
 * Records the byte length of each Server Action response inside the page (a cloned stream, read in full),
 * in sessionStorage so it survives a document change. Reading the body through the DevTools protocol
 * after the client has navigated is racy (Chromium may already have dropped it: CI run 39934032455).
 */
async function recordActionBodies(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (new Headers(init?.headers).has("next-action")) {
        void response
          .clone()
          .arrayBuffer()
          .then((body) => {
            const list = JSON.parse(sessionStorage.getItem("e2e-action-bytes") ?? "[]") as number[];
            sessionStorage.setItem("e2e-action-bytes", JSON.stringify([...list, body.byteLength]));
          });
      }
      return response;
    };
  });
}
const actionBodyBytes = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e-action-bytes") ?? "[]") as number[]);

/** Watches every response after the form is submitted. */
function watch(page: Page) {
  const seen: Response[] = [];
  page.on("response", (r) => seen.push(r));
  return seen;
}

async function submitSignIn(page: Page, password: string) {
  const form = page.locator("form").filter({ has: page.locator('input[name="password"]') });
  await form.locator('input[name="email"]').fill(USER.email);
  await form.locator('input[name="password"]').fill(password);
  const action = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await form.locator('button[type="submit"]').click();
  return action;
}

for (const [label, login, destination] of [
  ["Bangla (rewritten)", "/login", "/account"],
  ["English (control)", "/en/login", "/en/account"],
] as const) {
  test(`sign-in redirect, ${label}: the action response carries the destination; no extra request, no 3xx`, async ({ page, context }) => {
    await context.clearCookies();
    await recordActionBodies(page);
    await page.goto(login);
    const seen = watch(page);
    const action = await submitSignIn(page, USER.password);

    expect(action.status()).toBe(200);
    expect(action.headers()["x-action-redirect"] ?? "").toContain(destination);
    expect(action.headers()["content-type"] ?? "").toContain("text/x-component");
    // Empty when Next's internal fetch of the destination failed (the C-02 symptom).
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect.poll(() => actionBodyBytes(page)).toHaveLength(1);
    expect((await actionBodyBytes(page))[0]).toBeGreaterThan(200);
    await page.waitForLoadState("networkidle");
    const followUps = seen.filter((r) => r !== action && r.request().resourceType() === "fetch" && new URL(r.url()).pathname === destination);
    expect(followUps.map((r) => r.url())).toEqual([]);
    const redirected = seen.filter((r) => r.status() >= 300 && r.status() < 400).map((r) => `${r.status()} ${new URL(r.url()).pathname}`);
    expect(redirected).toEqual([]);
  });
}

test("a failed sign-in (wrong password) stays on the form: no redirect, no destination fetched", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  const seen = watch(page);
  const action = await submitSignIn(page, "not-the-password-0");
  expect(action.status()).toBe(200);
  expect(action.headers()["x-action-redirect"]).toBeUndefined();
  await expect(page).toHaveURL(/\/login$/);
  await page.waitForLoadState("networkidle");
  expect(seen.filter((r) => new URL(r.url()).pathname === "/account").map((r) => r.url())).toEqual([]);
});
