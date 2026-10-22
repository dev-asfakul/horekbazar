// B6 cart journey in a browser against the disposable database: add from the product page, see the
// re-priced cart, refuse more than is in stock, change quantity, a promotion and a coupon shown in
// the totals, delivery charge by zone, checkout still closed (features.checkout off), remove to an
// empty cart; strict CSP throughout, no horizontal scroll at 375 px.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { getSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { watchCsp } from "../e2e/helpers";

let client: MongoClient;
let db: Db;
const actor: Actor = { id: "e2e-owner", role: "owner", ip: "203.0.113.21" };
const lt = (bn: string, en: string) => ({ bn, en });
let variantId = "";

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  const existing = await db.collection("products").findOne({ slug: "e2e-cart-mustard-oil" });
  if (existing) {
    variantId = String((await db.collection("variants").findOne({ productId: existing._id }))!._id);
    return;
  }
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
  if (!(await getSettings(db)).delivery.zones.some((z) => z.id === "cart-zone-a")) {
    await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "cart-zone-a", name: lt("জোন এ", "Zone A"), fee: { amountMinor: 6000, currency: "BDT" }, estimate: lt("১-২ দিন", "1-2 days"), areas: [], enabled: true });
    await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "cart-zone-b", name: lt("জোন বি", "Zone B"), fee: { amountMinor: 12000, currency: "BDT" }, estimate: lt("৩-৫ দিন", "3-5 days"), areas: [], enabled: true });
  }
  const cat = String(await createCategory(db, client, actor, { slug: "e2e-cart-oils", parentId: null, name: lt("তেল", "Oils"), position: 9 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  const id = String(await createProduct(db, client, actor, { slug: "e2e-cart-mustard-oil", name: lt("সরিষার তেল", "Mustard Oil"), primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  variantId = String(await createVariant(db, client, actor, id, { sku: `E2E-${randomUUID().slice(0, 8).toUpperCase()}`, title: lt("১ লিটার", "1 litre"), options: [], price: { amountMinor: 25000, currency: "BDT" }, position: 0 }));
  await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId, qty: 6 }] });
  await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
});

test.afterAll(async () => client?.close());

test("cart: add, refuse over stock, update, promotion and coupon totals, zone charge, checkout closed, remove", async ({ page }) => {
  const csp = await watchCsp(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/p/e2e-cart-mustard-oil");
  const buy = page.getByTestId("add-to-cart");
  await buy.getByLabel("পরিমাণ").fill("2");
  await buy.getByRole("button", { name: "কার্টে যোগ করুন" }).click();
  await expect(page.getByRole("status").filter({ hasText: "কার্টে যোগ হয়েছে" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "অনলাইন অর্ডার চালু হলে" })).toBeVisible();

  // Over stock: 2 in the cart + 5 > 6 available.
  await buy.getByLabel("পরিমাণ").fill("5");
  await buy.getByRole("button", { name: "কার্টে যোগ করুন" }).click();
  await expect(page.getByText("এত পরিমাণ স্টকে নেই")).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByTestId("cart")).toHaveAttribute("data-state", "items");
  await expect(page.getByTestId("cart-subtotal")).toContainText("৫০০");
  await expect(page.getByTestId("checkout-off")).toBeVisible();
  await expect(page.getByTestId("checkout-link")).toHaveCount(0);

  const line = page.getByTestId("cart-line");
  await line.getByLabel("পরিমাণ").fill("3");
  await line.getByRole("button", { name: "আপডেট" }).click();
  await expect(page.getByTestId("cart-subtotal")).toContainText("৭৫০");

  // A 10% promotion on the product and a coupon set on this device's cart (coupon tries need the
  // rate-limit store, which this server does not have; the integration suite covers applying codes).
  const product = await db.collection("products").findOne({ slug: "e2e-cart-mustard-oil" });
  const now = new Date();
  await db.collection("promotions").insertOne({ _id: new ObjectId(), name: lt("অফার", "Offer"), kind: "product", discount: { type: "percent", value: 10 }, scope: { type: "products", ids: [product!._id] }, startsAt: new Date(now.getTime() - 60_000), sold: 0, status: "active", version: 1, createdAt: now, updatedAt: now });
  await db.collection("coupons").updateOne({ code: "E2ECART50" }, { $setOnInsert: { _id: new ObjectId(), code: "E2ECART50", kind: "fixed", value: 5000, used: 0, startsAt: new Date(now.getTime() - 60_000), eligibility: { firstOrderOnly: false, categoryIds: [], productIds: [], excludeCategoryIds: [], excludeProductIds: [], zoneIds: [] }, status: "active", version: 1, createdAt: now, updatedAt: now } }, { upsert: true });
  const device = (await page.context().cookies()).find((c) => c.name === "cart_device");
  expect(device?.httpOnly).toBe(true);
  await db.collection("carts").updateOne({ deviceId: device!.value, status: "active" }, { $set: { couponCode: "E2ECART50" } });

  await page.goto("/cart?zone=cart-zone-b");
  await expect(page.getByTestId("cart-subtotal")).toContainText("৬৭৫"); // 3 × 225
  await expect(page.getByTestId("coupon-applied")).toContainText("E2ECART50");
  await expect(page.getByTestId("cart-coupon-discount")).toContainText("৫০");
  await expect(page.getByTestId("cart-delivery")).toContainText("১২০");
  await expect(page.getByTestId("cart-total")).toContainText("৭৪৫"); // 675 − 50 + 120
  await expect(line.getByText("অফার")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await line.getByRole("button", { name: "সরান" }).click();
  await expect(page.getByTestId("cart")).toHaveAttribute("data-state", "empty");
  expect(await csp()).toEqual([]);
});
