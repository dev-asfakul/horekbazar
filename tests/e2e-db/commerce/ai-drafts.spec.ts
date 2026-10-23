// B9 part 2b AI drafts in a browser against the disposable database. Gemini is the local stub in
// scripts/e2e-db-server.mjs (never Google): it answers every requested field in both languages, and
// the editor's note can make it answer 429 or garbage. Checks: the free-tier notice; a draft changes
// nothing on the product; Apply writes exactly one field with an audit row; Gemini failures show a
// plain message and store nothing; staff without catalogue.write cannot open the page; the per-user
// hourly limit refuses the 21st request. Strict CSP throughout.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { createAuth } from "@/lib/modules/identity/auth";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { createProduct } from "@/lib/modules/catalogue/products";
import { watchCsp } from "../../e2e/helpers";

const EDITOR = { email: "e2e.ai.editor@example.test", password: "e2e-only-password-41", name: "E2E Catalogue Editor" };
const LIMITED = { email: "e2e.ai.limited@example.test", password: "e2e-only-password-42", name: "E2E Busy Editor" };
const SUPPORT = { email: "e2e.ai.support@example.test", password: "e2e-only-password-43", name: "E2E AI Support" };
const actor: Actor = { id: "e2e-seed", role: "owner", ip: null };

let client: MongoClient;
let db: Db;
let auth: ReturnType<typeof createAuth>;
let baseURL: string;
let productId: string;

async function signIn(context: BrowserContext, who: { email: string; password: string }) {
  const res = await auth.api.signInEmail({ body: { email: who.email, password: who.password }, returnHeaders: true });
  const cookies = res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const eq = pair!.indexOf("=");
    return { name: pair!.slice(0, eq), value: pair!.slice(eq + 1), domain: new URL(baseURL).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" as const };
  });
  await context.addCookies(cookies);
}

const product = () => db.collection("products").findOne({ _id: new ObjectId(productId) });
const draftsFor = () => db.collection("aiDrafts").find({ targetId: new ObjectId(productId) }).toArray();

async function requestDraft(page: Page, fields: string[], note = "") {
  const form = page.getByTestId("ai-draft-create");
  await form.getByLabel("Fields to draft").selectOption(fields);
  await form.getByLabel("Note to the AI (optional)").fill(note);
  await form.getByRole("button", { name: "Write draft" }).click();
  return form;
}

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string; authSecret: string; baseURL: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  baseURL = info.baseURL;
  auth = createAuth({ db, client, secret: info.authSecret, baseURL, production: true });
  for (const [u, role] of [[EDITOR, "catalogue_editor"], [LIMITED, "catalogue_editor"], [SUPPORT, "support_agent"]] as const) {
    if (!(await db.collection("user").findOne({ email: u.email }))) await auth.api.signUpEmail({ body: { name: u.name, email: u.email, password: u.password } });
    await db.collection("user").updateOne({ email: u.email }, { $set: { emailVerified: true, staffRoleKey: role } });
  }
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
  const slug = `e2e-ai-${randomUUID().slice(0, 8)}`;
  const cat = String(await createCategory(db, client, actor, { slug: `${slug}-cat`, parentId: null, name: { bn: "চাল", en: "Rice" }, position: 9 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  productId = String(await createProduct(db, client, actor, { slug, name: { bn: "মিনিকেট চাল", en: "Miniket rice" }, shortDescription: { bn: "পুরনো লেখা", en: "Old text" }, primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
});

test.afterAll(async () => {
  await client?.close();
});

test("editor: a draft changes nothing until one field is applied, with an audit row", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const csp = await watchCsp(page);
  await signIn(context, EDITOR);
  await page.goto(`/admin/products/${productId}`);
  await expect(page.getByTestId("ai-drafts")).toBeVisible();
  await expect(page.getByTestId("ai-free-tier-notice")).toContainText("Google may use what is sent");
  await expect(page.getByTestId("ai-drafts-empty")).toBeVisible();

  const before = await product();
  const form = await requestDraft(page, ["name", "shortDescription"], "mention the 5 kg pack");
  await expect(form).toContainText("Draft ready below. Nothing has changed on the product yet.");
  const draft = page.getByTestId("ai-draft");
  await expect(draft).toHaveCount(1);
  await expect(draft.getByTestId("ai-field-shortDescription")).toContainText("Draft shortDescription");
  // Writing the draft did not touch the product.
  expect(await product()).toEqual(before);
  const [stored] = await draftsFor();
  expect(stored).toMatchObject({ status: "pending", appliedFields: [], targetVersion: before!.version, instructions: "mention the 5 kg pack" });
  expect(await db.collection("auditLog").countDocuments({ action: "ai.draft_created", "target.id": productId })).toBe(1);

  // Apply only the short description.
  await draft.getByTestId("ai-apply-shortDescription").getByRole("button").click();
  await expect(page.getByTestId("ai-apply-shortDescription")).toHaveCount(0);
  await expect(draft.getByTestId("ai-field-shortDescription")).toContainText("Applied");
  const after = await product();
  expect(after!.shortDescription).toEqual({ bn: "খসড়া shortDescription", en: "Draft shortDescription" });
  expect(after!.name).toEqual(before!.name); // the other drafted field is untouched
  expect(after!.status).toBe(before!.status); // applying never publishes
  expect(after!.version).toBe(before!.version + 1);
  const audit = await db.collection("auditLog").findOne({ action: "product.ai_field_applied", "target.id": productId });
  expect(audit).toMatchObject({ before: { shortDescription: { bn: "পুরনো লেখা", en: "Old text" } }, after: { shortDescription: { bn: "খসড়া shortDescription" }, draftId: String(stored!._id) } });
  expect((await draftsFor())[0]).toMatchObject({ status: "partially_applied", appliedFields: ["shortDescription"] });

  // Discard closes the draft; the name was never applied.
  await draft.getByTestId("ai-discard").getByRole("button").click();
  await expect(page.getByTestId("ai-drafts-empty")).toBeVisible();
  expect((await draftsFor())[0]).toMatchObject({ status: "discarded" });
  expect((await product())!.name).toEqual(before!.name);
  expect(await csp()).toEqual([]);
  await context.close();
});

test("editor: Gemini busy or garbage answers show a plain message and store nothing", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(context, EDITOR);
  await page.goto(`/admin/products/${productId}`);
  const count = (await draftsFor()).length;
  const before = await product();
  let form = await requestDraft(page, ["description"], "E2E-GEMINI-BUSY");
  await expect(form).toContainText("The AI service is busy or its free limit is used up.");
  form = await requestDraft(page, ["description"], "E2E-GEMINI-GARBAGE");
  await expect(form).toContainText("The AI answer was incomplete or too long.");
  expect(await draftsFor()).toHaveLength(count);
  expect(await product()).toEqual(before);
  await context.close();
});

test("support agent cannot open the product page; the hourly limit refuses the 21st draft", async ({ browser }) => {
  const support = await browser.newContext();
  const sp = await support.newPage();
  await signIn(support, SUPPORT);
  expect((await sp.goto(`/admin/products/${productId}`))?.status()).toBe(403);
  await support.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(context, LIMITED);
  await page.goto(`/admin/products/${productId}`);
  const editor = await db.collection("user").findOne({ email: LIMITED.email });
  const mine = () => db.collection("aiDrafts").countDocuments({ createdBy: String(editor!._id) });
  // 20 per staff user per hour (LIMITS.aiDraft), counted on the server whatever the page sends.
  for (let i = 1; i <= 20; i++) {
    const form = await requestDraft(page, ["seoTitle"]);
    await expect(form).toContainText("Draft ready below.");
    await expect.poll(mine).toBe(i);
  }
  const form = await requestDraft(page, ["seoTitle"]);
  await expect(form).toContainText("Too many attempts.");
  expect(await mine()).toBe(20);
  await context.close();
});
