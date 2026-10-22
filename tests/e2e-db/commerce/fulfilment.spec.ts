// B8 fulfilment journeys in a browser against the disposable database: an order operator creates a
// manual shipment, records the consignment and tracking link, hands it over (stock committed) and
// marks it delivered; unconfigured couriers say so; the customer sees only recorded checkpoints and
// asks for a return; the operator approves, receives, inspects, restocks and records the refund. A
// support agent cannot open the shipments or returns pages. Strict CSP throughout; the customer's
// order page has no horizontal overflow on a 360 px phone.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { createAuth } from "@/lib/modules/identity/auth";
import { createAddress } from "@/lib/modules/orders/addresses";
import { placeOrder } from "@/lib/modules/orders/checkout";
import { transitionOrder } from "@/lib/modules/orders/transitions";
import { addToCart } from "@/lib/modules/pricing/cart";
import { quoteLines } from "@/lib/modules/pricing/quote";
import { getSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { watchCsp } from "../../e2e/helpers";

const CUSTOMER = { email: "e2e.ship.customer@example.test", password: "e2e-only-password-9", name: "করিম মিয়া" };
const OPERATOR = { email: "e2e.ship.operator@example.test", password: "e2e-only-password-10", name: "E2E Ship Operator" };
const SUPPORT = { email: "e2e.ship.support@example.test", password: "e2e-only-password-11", name: "E2E Support" };
const actor: Actor = { id: "e2e-owner", role: "owner", ip: "203.0.113.23" };
const staffActor = { type: "staff" as const, id: "e2e-owner", role: "owner", ip: null };
const lt = (bn: string, en: string) => ({ bn, en });

let client: MongoClient;
let db: Db;
let auth: ReturnType<typeof createAuth>;
let baseURL: string;
let variantId = "";

async function signIn(context: BrowserContext, who: { email: string; password: string }) {
  const res = await auth.api.signInEmail({ body: { email: who.email, password: who.password }, returnHeaders: true });
  const cookies = res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const eq = pair!.indexOf("=");
    return { name: pair!.slice(0, eq), value: pair!.slice(eq + 1), domain: new URL(baseURL).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" as const };
  });
  await context.addCookies(cookies);
}

const stock = async () => (await db.collection("stock").findOne({ variantId: new ObjectId(variantId) }))!;

/** A customer order walked to ready_to_ship with the services (the checkout UI is covered by checkout.spec). */
async function readyOrder() {
  await db.collection("settings").updateOne({ _id: "settings" } as never, { $set: { "features.checkout": true } });
  const user = (await db.collection("user").findOne({ email: CUSTOMER.email }))!;
  const userId = String(user._id);
  await addToCart(db, { userId }, variantId, 2);
  const addressId = String(await createAddress(db, userId, { label: "home", name: "করিম মিয়া", phone: "01912-345678", zoneId: "ship-zone", district: "ঢাকা", area: "উত্তরা", line: "বাসা ৭, রোড ২" }));
  const cart = (await db.collection("carts").findOne({ userId, status: "active" }))!;
  const quote = await quoteLines(db, cart.lines, { userId, couponCode: cart.couponCode, zoneId: "ship-zone" });
  const { orderId } = await placeOrder(db, client, { userId, customer: { name: CUSTOMER.name, email: CUSTOMER.email }, addressId, expectedTotal: quote.priced.total, idempotencyKey: randomUUID(), locale: "bn" });
  await db.collection("settings").updateOne({ _id: "settings" } as never, { $set: { "features.checkout": false } });
  let v = 1;
  for (const to of ["confirmed", "processing", "ready_to_ship"] as const) v = (await transitionOrder(db, client, { orderId: new ObjectId(orderId), expectedVersion: v, to, actor: staffActor })).version;
  return (await db.collection("orders").findOne({ _id: new ObjectId(orderId) }))!;
}

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string; authSecret: string; baseURL: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  baseURL = info.baseURL;
  auth = createAuth({ db, client, secret: info.authSecret, baseURL, production: true });
  for (const [u, role] of [[CUSTOMER, null], [OPERATOR, "order_operator"], [SUPPORT, "support_agent"]] as const) {
    if (!(await db.collection("user").findOne({ email: u.email }))) await auth.api.signUpEmail({ body: { name: u.name, email: u.email, password: u.password } });
    await db.collection("user").updateOne({ email: u.email }, { $set: { emailVerified: true, ...(role ? { staffRoleKey: role } : {}) } });
  }
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
  if (!(await getSettings(db)).delivery.zones.some((z) => z.id === "ship-zone")) {
    await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "ship-zone", name: lt("শিপ জোন", "Ship zone"), fee: { amountMinor: 6000, currency: "BDT" }, estimate: lt("২ দিন", "2 days"), areas: [], enabled: true });
  }
  const existing = await db.collection("products").findOne({ slug: "e2e-ship-tea" });
  if (existing) {
    variantId = String((await db.collection("variants").findOne({ productId: existing._id }))!._id);
    return;
  }
  const cat = String(await createCategory(db, client, actor, { slug: "e2e-ship-drinks", parentId: null, name: lt("চা", "Tea"), position: 11 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  const productId = String(await createProduct(db, client, actor, { slug: "e2e-ship-tea", name: lt("চা পাতা", "Tea leaves"), primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  variantId = String(await createVariant(db, client, actor, productId, { sku: `E2E-${randomUUID().slice(0, 8).toUpperCase()}`, title: lt("৫০০ গ্রাম", "500 g"), options: [], price: { amountMinor: 30000, currency: "BDT" }, position: 0 }));
  await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId, qty: 20 }] });
  await setProductStatus(db, client, actor, productId, (await getProduct(db, productId))!.product.version, "published");
});

test.afterAll(async () => {
  await db.collection("settings").updateOne({ _id: "settings" } as never, { $set: { "features.checkout": false } });
  await client?.close();
});

test("operator ships manually; customer tracks and returns; operator inspects, restocks and records the refund", async ({ browser }) => {
  const order = await readyOrder();
  const staff = await browser.newContext();
  const page = await staff.newPage();
  const csp = await watchCsp(page);
  await signIn(staff, OPERATOR);

  await page.goto("/admin/shipments");
  await expect(page.getByTestId("courier-states").locator('[data-courier="manual"]')).toHaveAttribute("data-state", "available");
  await expect(page.getByTestId("courier-states").locator('[data-courier="steadfast"]')).toHaveAttribute("data-state", "not_configured");
  await expect(page.getByTestId("courier-states").locator('[data-courier="pathao"]')).toHaveAttribute("data-state", "blocked");

  await page.goto(`/admin/orders/${order.orderNumber}`);
  const panel = page.getByTestId("shipment-panel");
  await expect(panel.getByTestId("courier-unavailable").locator('[data-courier="steadfast"]')).toBeVisible();
  await expect(page.getByTestId("order-to-shipped")).toHaveCount(0); // shipping is a shipment step
  const create = panel.getByTestId("shipment-create");
  await expect(create.getByLabel("Courier").locator("option")).toHaveText(["Manual"]);
  await create.getByRole("button", { name: "Create shipment" }).click();
  await expect(create.getByRole("alert")).toBeVisible(); // carrier name required
  await create.getByLabel("Carrier name").fill("Local rider");
  await create.getByRole("button", { name: "Create shipment" }).click();
  await expect(panel.getByTestId("shipment-current")).toHaveAttribute("data-status", "draft");
  await expect(panel.getByTestId("shipment-to-handed_over")).toHaveCount(0); // needs a consignment first
  expect(await db.collection("inventoryLedger").countDocuments({ refId: String(order._id), kind: "commit" })).toBe(0);

  const tracking = panel.getByTestId("shipment-tracking");
  await tracking.getByLabel("Tracking link").fill("http://not-secure.example.com");
  await tracking.getByLabel("Consignment id").fill(`E2E-${order.orderNumber}`);
  await tracking.getByRole("button", { name: "Save tracking" }).click();
  await expect(tracking.getByLabel("Tracking link")).toHaveAttribute("aria-invalid", "true");
  await tracking.getByLabel("Tracking link").fill("https://tracking.example.com/p/123");
  await tracking.getByRole("button", { name: "Save tracking" }).click();
  await expect(panel.getByTestId("shipment-current")).toHaveAttribute("data-status", "booked");

  const before = await stock();
  await panel.getByTestId("shipment-to-handed_over").getByRole("button", { name: "Mark handed to courier" }).click();
  await expect(page.getByTestId("admin-order")).toHaveAttribute("data-status", "shipped");
  expect(await stock()).toMatchObject({ onHand: before.onHand - 2, reserved: before.reserved - 2 });
  await panel.getByTestId("shipment-to-delivered").getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByTestId("admin-order")).toHaveAttribute("data-status", "delivered");

  // Customer: recorded checkpoints and the entered link only; then a return request.
  const shopper = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const cp = await shopper.newPage();
  const ccsp = await watchCsp(cp);
  await signIn(shopper, CUSTOMER);
  await cp.goto(`/account/orders/${order.orderNumber}`);
  const track = cp.getByTestId("order-tracking");
  await expect(track).toHaveAttribute("data-status", "delivered");
  await expect(cp.getByTestId("order-tracking-number")).toHaveText(`E2E-${order.orderNumber}`);
  await expect(cp.getByTestId("order-tracking-link")).toHaveAttribute("href", "https://tracking.example.com/p/123");
  await expect(cp.getByTestId("order-tracking-checkpoints").locator("li")).toHaveCount(3);
  expect(await cp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const returnForm = cp.getByTestId("order-return-form");
  await returnForm.getByRole("button", { name: "রিটার্ন রিকোয়েস্ট করুন" }).click();
  await expect(returnForm.getByRole("alert")).toBeVisible();
  await returnForm.getByLabel(/কয়টা রিটার্ন করবেন/).fill("১");
  await returnForm.getByLabel("রিটার্নের কারণ").fill("প্যাকেট ছেঁড়া ছিল");
  await returnForm.getByRole("button", { name: "রিটার্ন রিকোয়েস্ট করুন" }).click();
  await expect(cp.getByTestId("order-return-list").locator("li")).toHaveCount(1);
  expect(await ccsp()).toEqual([]);
  await shopper.close();

  const ret = (await db.collection("returns").findOne({ orderId: order._id }))!;
  expect(ret).toMatchObject({ status: "requested", lines: [{ qty: 1 }] });
  await page.goto("/admin/returns?status=requested");
  await page.getByRole("link", { name: order.orderNumber }).click();
  const detail = page.getByTestId("admin-return");
  await page.getByTestId("return-to-approved").getByRole("button", { name: "Approve" }).click();
  await expect(detail).toHaveAttribute("data-status", "approved");
  await page.getByTestId("return-to-received").getByRole("button", { name: "Mark received" }).click();
  await expect(detail).toHaveAttribute("data-status", "received");
  const afterDelivery = await stock();
  const inspect = page.getByTestId("return-inspect");
  await inspect.getByLabel(/^Decision/).selectOption("restock");
  await inspect.getByRole("button", { name: "Save inspection" }).click();
  await expect(detail).toHaveAttribute("data-status", "inspected");
  expect((await stock()).onHand).toBe(afterDelivery.onHand); // inspection alone moves nothing
  await page.getByTestId("return-settle").getByRole("button", { name: "Apply to stock" }).click();
  await expect(detail).toHaveAttribute("data-status", "restocked");
  expect((await stock()).onHand).toBe(afterDelivery.onHand + 1);
  const refund = page.getByTestId("return-refund-form");
  await refund.getByLabel("Method").selectOption("bkash");
  await refund.getByLabel("Amount (৳)").fill("300");
  await refund.getByLabel("Reference").fill("BK-E2E-1");
  await refund.getByRole("button", { name: "Record refund" }).click();
  await expect(detail).toHaveAttribute("data-status", "refunded");
  expect(await db.collection("auditLog").countDocuments({ action: { $in: ["shipment.create", "shipment.tracking", "shipment.transition", "return.transition"] }, "actor.id": String((await db.collection("user").findOne({ email: OPERATOR.email }))!._id) })).toBeGreaterThanOrEqual(8);
  expect(await csp()).toEqual([]);
  await staff.close();
});

test("support agent cannot open shipments or returns", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(context, SUPPORT);
  expect((await page.goto("/admin/shipments"))?.status()).toBe(403);
  expect((await page.goto("/admin/returns"))?.status()).toBe(403);
  await context.close();
});
