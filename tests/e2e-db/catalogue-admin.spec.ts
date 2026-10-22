// B4 signed-in admin journey against a disposable database (scripts/e2e-db-server.mjs): a catalogue
// editor signs in, creates and publishes a category, creates a product (the LabelTile preview shows
// because there is no photo), adds a variant, publishes the product, and is refused a section their
// role does not have. Server-side state is checked in the database, not only in the page.
//
// Sign-in: in a production build the login form needs the Upstash rate-limit store (it fails closed
// without it — tests/e2e covers that state). So the fixture signs in with the app's own auth service
// and the server's throwaway secret, and hands the resulting session cookie to the browser. Every
// admin request after that is a normal browser request checked by the server.
import { readFileSync, rmSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { MongoClient, type Db } from "mongodb";
import { createAuth } from "@/lib/modules/identity/auth";

const EMAIL = "e2e.editor@example.test";
const PASSWORD = "e2e-only-password-9";

let client: MongoClient;
let db: Db;
let auth: ReturnType<typeof createAuth>;
let baseURL: string;

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string; authSecret: string; baseURL: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  baseURL = info.baseURL;
  auth = createAuth({ db, client, secret: info.authSecret, baseURL, production: true });
  // Registration is closed while email is not configured (correct behaviour), so the fixture user is
  // created through the auth service, as the integration tests do.
  if (!(await db.collection("user").findOne({ email: EMAIL }))) await auth.api.signUpEmail({ body: { name: "E2E Editor", email: EMAIL, password: PASSWORD } });
  // Test fixture only: verify the address and grant the built-in catalogue_editor role (no 2FA required).
  const updated = await db.collection("user").updateOne({ email: EMAIL }, { $set: { emailVerified: true, staffRoleKey: "catalogue_editor" } });
  expect(updated.matchedCount).toBe(1);
});

async function signIn(context: BrowserContext) {
  const res = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, returnHeaders: true });
  const cookies = res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const eq = pair!.indexOf("=");
    return { name: pair!.slice(0, eq), value: pair!.slice(eq + 1), domain: new URL(baseURL).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" as const };
  });
  expect(cookies.some((c) => c.name.includes("session_token"))).toBe(true);
  await context.addCookies(cookies);
}

test.afterAll(async () => {
  await client?.close();
  // The harness may be killed before it can clean up; the throwaway secret is useless after the run.
  rmSync("test-results/e2e-db.json", { force: true });
});

test("catalogue editor creates, fills and publishes a product", async ({ page }) => {
  await signIn(page.context());
  await page.goto("/admin/categories");
  await expect(page.getByTestId("admin-categories")).toBeVisible();
  await expect(page.getByTestId("categories-empty")).toBeVisible();

  // Category: create, then publish.
  const catForm = page.getByTestId("category-create-form");
  await catForm.locator('input[name="slug"]').fill("e2e-kitchen");
  await catForm.locator('[name="nameBn"]').fill("রান্নাঘর");
  await catForm.locator('[name="nameEn"]').fill("Kitchen");
  await catForm.locator('button[type="submit"]').click();
  const row = page.locator('li[data-slug="e2e-kitchen"]');
  await expect(row).toBeVisible();
  await row.locator("summary").click();
  await row.locator(".status-actions form").first().locator('button[type="submit"]').click();
  await expect(row.locator('.status-chip[data-tone="published"]')).toBeVisible();
  const category = await db.collection("categories").findOne({ slug: "e2e-kitchen" });
  expect(category?.status).toBe("published");

  // Product: create (draft).
  await page.goto("/admin/products/new");
  const prodForm = page.getByTestId("product-create-form");
  await prodForm.locator('input[name="slug"]').fill("e2e-steel-pot");
  await prodForm.locator('[name="nameBn"]').fill("স্টিলের হাঁড়ি");
  await prodForm.locator('[name="nameEn"]').fill("Steel pot");
  await prodForm.locator('select[name="primaryCategoryId"]').selectOption(String(category!._id));
  await prodForm.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/products\/[0-9a-f]{24}\?created=1/);
  await expect(page.getByTestId("admin-product")).toBeVisible();
  // No photo yet: the honest LabelTile, never a stock image.
  await expect(page.getByTestId("product-preview").locator("img")).toHaveCount(0);
  await expect(page.getByTestId("product-preview")).toContainText("Kitchen"); // the admin is English only: the English category name
  await expect(page.getByTestId("variants-empty")).toBeVisible();

  // Publishing without an active priced variant is refused by the server.
  await page.getByTestId("product-status-published").locator('button[type="submit"]').click();
  await expect(page.getByTestId("product-status-published").locator('[role="alert"], .form-summary').first()).toBeVisible();
  expect((await db.collection("products").findOne({ slug: "e2e-steel-pot" }))?.status).toBe("draft");

  // Variant: price typed in taka, stored in paisa.
  const varForm = page.getByTestId("variant-create-form");
  await varForm.locator('input[name="sku"]').fill("E2E-POT-5L");
  await varForm.locator('[name="titleBn"]').fill("৫ লিটার");
  await varForm.locator('input[name="price"]').fill("1250.50");
  await varForm.locator('button[type="submit"]').click();
  await expect(page.getByTestId("variant-rows")).toContainText("E2E-POT-5L");
  const variant = await db.collection("variants").findOne({ sku: "E2E-POT-5L" });
  expect(variant?.price).toEqual({ amountMinor: 125050, currency: "BDT" });
  expect((await db.collection("stock").findOne({ variantId: variant!._id }))?.onHand).toBe(0);

  // Publish.
  await page.getByTestId("product-status-published").locator('button[type="submit"]').click();
  await expect(page.getByTestId("product-status-draft")).toBeVisible();
  const product = await db.collection("products").findOne({ slug: "e2e-steel-pot" });
  expect(product?.status).toBe("published");
  expect(product?.publishedAt).toBeInstanceOf(Date);

  // Listed with its status.
  await page.goto("/admin/products?q=e2e");
  await expect(page.getByTestId("products-table")).toContainText("e2e-steel-pot");

  // Audit trail written by the server for every change.
  const actions = (await db.collection("auditLog").find({ "actor.role": "catalogue_editor" }).toArray()).map((a) => a.action as string);
  expect(actions).toEqual(expect.arrayContaining(["category.created", "product.created"]));
  expect(actions.length).toBeGreaterThanOrEqual(5); // category create + publish, product create, variant create, product publish
});

test("bulk status changes the selected products on the server, one by one", async ({ page, viewport }) => {
  await signIn(page.context());
  await page.goto("/admin/products?q=e2e");
  const form = page.getByTestId("bulk-status-form");
  // Nothing selected: the server refuses with a clear message.
  await form.getByRole("button", { name: "Apply to selected" }).click();
  await expect(form.getByRole("alert")).toHaveText("Select at least one product.");

  // Select the product (visible layout only), set it back to draft.
  await form.getByRole("button", { name: "Select all on this page" }).click();
  await expect(page.getByTestId("bulk-count")).toHaveText("1 selected");
  await form.getByLabel("New status").selectOption("draft");
  await form.getByRole("button", { name: "Apply to selected" }).click();
  await expect(form.getByRole("status").first()).toContainText("1 of 1 products changed.");
  const status = async () => (await db.collection("products").findOne({ slug: "e2e-steel-pot" }))?.status;
  await expect.poll(status).toBe("draft");

  // Publish again through the same rules as the single-product button.
  await form.getByRole("button", { name: "Select all on this page" }).click();
  await form.getByLabel("New status").selectOption("published");
  await form.getByRole("button", { name: "Apply to selected" }).click();
  // The result line reads the same as before, so the server state decides.
  await expect.poll(status).toBe("published");
  await expect(form.getByRole("status").first()).toContainText("1 of 1 products changed.");
  const audit = await db.collection("auditLog").find({ action: { $in: ["product.draft", "product.published"] }, "target.type": "product" }).toArray();
  expect(audit.length).toBeGreaterThanOrEqual(3);
  expect(viewport).not.toBeNull();
});

test("a section outside the role is refused by the server", async ({ page }) => {
  await signIn(page.context());
  // (/admin itself shows first-owner setup while no owner exists — B3 behaviour.)
  await page.goto("/admin/products");
  await expect(page.getByTestId("admin-products")).toBeVisible();
  // The nav lists only the role's sections …
  await expect(page.locator('nav a[href="/admin/products"]')).toHaveCount(1);
  await expect(page.locator('nav a[href="/admin/inventory"]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/admin/settings"]')).toHaveCount(0);
  // … and the server refuses the others regardless of the nav.
  const res = await page.goto("/admin/inventory");
  expect(res?.status()).toBe(403);
  const settings = await page.goto("/admin/settings");
  expect(settings?.status()).toBe(403);
});
