// B7 ordering journey in a browser against the disposable database: checkout closed while ordering is
// off, a signed-in customer adds an address (BD mobile number), places a cash-on-delivery order, sees
// it in their account and cancels it (stock released); a sample product blocks checkout; an order
// operator confirms a second order from the admin. Strict CSP throughout.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { createAuth } from "@/lib/modules/identity/auth";
import { getSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { watchCsp } from "../../e2e/helpers";

const CUSTOMER = { email: "e2e.customer@example.test", password: "e2e-only-password-7", name: "রহিম উদ্দিন" };
const OPERATOR = { email: "e2e.operator@example.test", password: "e2e-only-password-8", name: "E2E Operator" };
const actor: Actor = { id: "e2e-owner", role: "owner", ip: "203.0.113.22" };
const lt = (bn: string, en: string) => ({ bn, en });

let client: MongoClient;
let db: Db;
let auth: ReturnType<typeof createAuth>;
let baseURL: string;
let variantId = "";
let productId = "";

async function signIn(context: BrowserContext, who: { email: string; password: string }) {
  const res = await auth.api.signInEmail({ body: { email: who.email, password: who.password }, returnHeaders: true });
  const cookies = res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const eq = pair!.indexOf("=");
    return { name: pair!.slice(0, eq), value: pair!.slice(eq + 1), domain: new URL(baseURL).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" as const };
  });
  await context.addCookies(cookies);
}

const setCheckout = (on: boolean) => db.collection("settings").updateOne({ _id: "settings" } as never, { $set: { "features.checkout": on } });
const stock = async () => (await db.collection("stock").findOne({ variantId: new ObjectId(variantId) }))!;

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string; authSecret: string; baseURL: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  baseURL = info.baseURL;
  auth = createAuth({ db, client, secret: info.authSecret, baseURL, production: true });
  for (const u of [CUSTOMER, OPERATOR]) {
    if (!(await db.collection("user").findOne({ email: u.email }))) await auth.api.signUpEmail({ body: { name: u.name, email: u.email, password: u.password } });
    await db.collection("user").updateOne({ email: u.email }, { $set: { emailVerified: true, ...(u === OPERATOR ? { staffRoleKey: "order_operator" } : {}) } });
  }
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
  if (!(await getSettings(db)).delivery.zones.some((z) => z.id === "checkout-zone")) {
    await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "checkout-zone", name: lt("চেকআউট জোন", "Checkout zone"), fee: { amountMinor: 8000, currency: "BDT" }, estimate: lt("২ দিন", "2 days"), areas: [], enabled: true });
  }
  const existing = await db.collection("products").findOne({ slug: "e2e-checkout-rice" });
  if (existing) {
    productId = String(existing._id);
    variantId = String((await db.collection("variants").findOne({ productId: existing._id }))!._id);
    return;
  }
  const cat = String(await createCategory(db, client, actor, { slug: "e2e-checkout-grains", parentId: null, name: lt("চাল", "Rice"), position: 10 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  productId = String(await createProduct(db, client, actor, { slug: "e2e-checkout-rice", name: lt("মিনিকেট চাল", "Miniket Rice"), primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  variantId = String(await createVariant(db, client, actor, productId, { sku: `E2E-${randomUUID().slice(0, 8).toUpperCase()}`, title: lt("৫ কেজি", "5 kg"), options: [], price: { amountMinor: 42000, currency: "BDT" }, position: 0 }));
  await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId, qty: 10 }] });
  await setProductStatus(db, client, actor, productId, (await getProduct(db, productId))!.product.version, "published");
});

test.afterAll(async () => {
  await setCheckout(false);
  await client?.close();
});

async function addToCart(page: import("@playwright/test").Page, qty: string) {
  await page.goto("/p/e2e-checkout-rice");
  const buy = page.getByTestId("add-to-cart");
  await buy.getByLabel("পরিমাণ").fill(qty);
  await buy.getByRole("button", { name: "কার্টে যোগ করুন" }).click();
  await expect(page.getByRole("status").filter({ hasText: "কার্টে যোগ হয়েছে" })).toBeVisible();
}

test("customer: closed checkout, address, place a COD order, see it, cancel it; sample blocks checkout", async ({ page, context }) => {
  const csp = await watchCsp(page);
  await setCheckout(false);
  await signIn(context, CUSTOMER);
  await addToCart(page, "2");
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout")).toHaveAttribute("data-state", "closed");

  await setCheckout(true);
  await page.goto("/cart");
  await page.getByTestId("checkout-link").click();
  await expect(page.getByTestId("checkout")).toHaveAttribute("data-state", "open");
  const form = page.getByTestId("checkout-address-form");
  await form.getByLabel("যিনি নেবেন তাঁর নাম").fill("রহিম উদ্দিন");
  await form.getByLabel("মোবাইল নম্বর").fill("0171234567"); // one digit short
  await form.getByLabel("ডেলিভারি এরিয়া").selectOption("checkout-zone");
  await form.getByLabel("জেলা").fill("ঢাকা");
  await form.getByLabel("থানা / এলাকা").fill("মিরপুর");
  await form.getByLabel("বাসা, রোড, ব্লক").fill("বাসা ১২, রোড ৩");
  await form.getByRole("button", { name: "অ্যাড্রেস সেভ করুন" }).click();
  await expect(form.getByLabel("মোবাইল নম্বর")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("মোবাইল নম্বর").fill("01712-345678");
  await form.getByRole("button", { name: "অ্যাড্রেস সেভ করুন" }).click();
  await expect(page.getByTestId("checkout-chosen-address")).toContainText("01712-345678");
  await page.goto("/checkout?address=" + String((await db.collection("addresses").findOne({ phone: "+8801712345678" }))!._id));
  await expect(page.getByTestId("checkout-delivery")).toContainText("৮০");
  await expect(page.getByTestId("checkout-total")).toContainText("৯২০"); // 2 × 420 + 80

  // Sample products are never sold, even with ordering on.
  await db.collection("products").updateOne({ _id: new ObjectId(productId) }, { $set: { sample: true } });
  await page.reload();
  await expect(page.getByTestId("checkout-sample")).toBeVisible();
  await expect(page.getByTestId("place-order-form")).toHaveCount(0);
  await db.collection("products").updateOne({ _id: new ObjectId(productId) }, { $unset: { sample: "" } });
  await page.reload();

  const before = await stock();
  await page.getByTestId("place-order-form").getByRole("button", { name: "অর্ডার কনফার্ম করুন" }).click();
  await expect(page.getByTestId("checkout-success")).toBeVisible();
  const order = (await db.collection("orders").find({ "customer.email": CUSTOMER.email }).sort({ placedAt: -1 }).limit(1).next())!;
  expect(order).toMatchObject({ status: "pending_confirmation", paymentMethod: "cod", totals: { grandTotal: 92000 } });
  await expect(page.getByTestId("checkout-success")).toContainText(order.orderNumber);
  expect((await stock()).reserved).toBe(before.reserved + 2);

  await page.goto("/account/orders");
  await expect(page.getByTestId("order-row").filter({ hasText: order.orderNumber })).toBeVisible();
  await page.getByRole("link", { name: order.orderNumber }).click();
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "pending_confirmation");
  await page.getByTestId("order-cancel-form").getByRole("button", { name: "অর্ডার বাতিল করুন" }).click();
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "cancelled_by_customer");
  expect((await stock()).reserved).toBe(before.reserved);
  expect(await csp()).toEqual([]);
});

test("operator confirms an order from the admin, with the customer's number to call", async ({ browser }) => {
  const customer = await browser.newContext();
  const cp = await customer.newPage();
  await setCheckout(true);
  await signIn(customer, CUSTOMER);
  await addToCart(cp, "1");
  await cp.goto("/checkout");
  await cp.getByTestId("place-order-form").getByRole("button", { name: "অর্ডার কনফার্ম করুন" }).click();
  await expect(cp.getByTestId("checkout-success")).toBeVisible();
  const order = (await db.collection("orders").find({ "customer.email": CUSTOMER.email, status: "pending_confirmation" }).sort({ placedAt: -1 }).limit(1).next())!;
  await customer.close();

  const staff = await browser.newContext();
  const page = await staff.newPage();
  const csp = await watchCsp(page);
  await signIn(staff, OPERATOR);
  await page.goto("/admin/orders?status=pending_confirmation");
  await page.getByRole("link", { name: order.orderNumber }).click();
  await expect(page.getByTestId("admin-order")).toHaveAttribute("data-status", "pending_confirmation");
  await expect(page.getByTestId("order-phone")).toHaveAttribute("href", "tel:+8801712345678");
  await page.getByTestId("order-to-confirmed").getByRole("button", { name: "Confirm order" }).click();
  await expect(page.getByTestId("admin-order")).toHaveAttribute("data-status", "confirmed");
  const events = await db.collection("orderEvents").find({ orderId: order._id }).sort({ seq: 1 }).toArray();
  expect(events.map((e) => e.to)).toEqual(["pending_confirmation", "confirmed"]);
  expect(await db.collection("outbox").countDocuments({ idempotencyKey: `email.send:order-${String(order._id)}:2` })).toBe(1);
  expect(await csp()).toEqual([]);
  await staff.close();
});
