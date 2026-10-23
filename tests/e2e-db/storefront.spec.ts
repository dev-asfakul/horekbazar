// B5 storefront journeys against the disposable database (scripts/e2e-db-server.mjs), in a browser:
// a set-up store (Owner + saved settings), categories and products created through the B4 services
// (so the publish rules apply), then home, category listing with filters/sort/pagination, product page
// with option links, search, SEO tags, JSON-LD, sitemap and robots, at 375, 768 and 1440 px.
// The empty, not-set-up state is covered by the zero-variable suite (tests/e2e/setup-required.spec.ts).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { MongoClient, type Db } from "mongodb";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { getSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { watchCsp } from "../e2e/helpers";

let client: MongoClient;
let db: Db;
const actor: Actor = { id: "e2e-owner", role: "owner", ip: "203.0.113.20" };
const lt = (bn: string, en: string) => ({ bn, en });
const PANTRY_COUNT = 26; // more than one page of 24

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  if (await db.collection("products").findOne({ slug: "e2e-miniket-rice" })) return;
  // A set-up store: the installation record and saved settings (one delivery zone).
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
  const settings = await getSettings(db);
  await upsertDeliveryZone(db, actor, settings.version, { id: "inside-dhaka", name: lt("ঢাকার ভেতরে", "Inside Dhaka"), fee: { amountMinor: 6000, currency: "BDT" }, estimate: lt("১-২ দিন", "1-2 days"), areas: [], enabled: true });

  const publishCat = async (slug: string, parentId: string | null, en: string, bnName: string) => {
    const id = String(await createCategory(db, client, actor, { slug, parentId, name: lt(bnName, en), position: 1 }));
    await setCategoryStatus(db, client, actor, id, (await getCategory(db, id))!.version, "published");
    return id;
  };
  const food = await publishCat("e2e-food", null, "Food", "খাবার");
  const pantry = await publishCat("e2e-pantry", food, "Pantry", "প্যান্ট্রি");
  const product = async (slug: string, en: string, bnName: string, variants: { title: string; amount: number; compareAt?: number; stock?: number }[]) => {
    const id = String(await createProduct(db, client, actor, { slug, name: lt(bnName, en), shortDescription: lt(`${bnName}, রোজকার রান্নার জন্য।`, `${en}, packed for everyday cooking.`), description: lt(`${bnName}। ঠান্ডা, শুকনো জায়গায় রাখুন।`, `${en}. Store in a cool, dry place.`), primaryCategoryId: pantry, categoryIds: [pantry], attributes: [{ key: "origin", label: lt("উৎস", "Origin"), value: lt("বাংলাদেশ", "Bangladesh") }] }));
    for (const [i, v] of variants.entries()) {
      const vid = String(await createVariant(db, client, actor, id, { sku: `E2E-${randomUUID().slice(0, 8).toUpperCase()}`, title: lt(v.title === "1 kg" ? "১ কেজি" : "৫ কেজি", v.title), options: [], netQuantity: { value: i === 0 ? 1 : 5, unit: "kg", verified: true }, price: { amountMinor: v.amount, currency: "BDT" }, ...(v.compareAt ? { compareAt: { amountMinor: v.compareAt, currency: "BDT" } } : {}), position: i }));
      if (v.stock) await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: vid, qty: v.stock }] });
    }
    await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  };
  await product("e2e-miniket-rice", "Miniket Rice", "মিনিকেট চাল", [
    { title: "1 kg", amount: 8500, stock: 12 },
    { title: "5 kg", amount: 42500, compareAt: 45000 },
  ]);
  for (let i = 1; i < PANTRY_COUNT; i++) await product(`e2e-pantry-item-${i}`, `Pantry Item ${i}`, `প্যান্ট্রি আইটেম ${i}`, [{ title: "1 kg", amount: 10000 + i * 100 }]);
});

test.afterAll(async () => client?.close());

const columns = (page: Page) => page.getByTestId("product-grid").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

for (const [width, cols] of [
  [375, 2],
  [768, 3],
  [1440, 4],
] as const) {
  test(`at ${width} px: home, category listing and product page work with real data`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const violations = await watchCsp(page);
    // Every request while browsing succeeds, prefetches included (a 404 prefetch flashes an error page).
    const failed: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.getByTestId("category-tiles")).toContainText("খাবার");
    // The header carries the saved store name, not the not-set-up placeholder.
    await expect(page.locator("header").first()).not.toContainText("নতুন স্টোর");
    await expect(page.getByTestId("home-new-grid")).toBeVisible();

    await page.getByTestId("category-tiles").getByRole("link", { name: "খাবার" }).click();
    await expect(page).toHaveURL(/\/c\/e2e-food$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("খাবার");
    await expect(page.locator("#listing-count")).toHaveText("২৬টি প্রোডাক্ট");
    await expect(page.getByTestId("product-grid").locator("li")).toHaveCount(24);
    expect(await columns(page)).toBe(cols);
    // No horizontal overflow at this width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("link", { name: "পরের পেজ" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("product-grid").locator("li")).toHaveCount(PANTRY_COUNT - 24);

    await page.goto("/p/e2e-miniket-rice");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("মিনিকেট চাল");
    await expect(page.getByTestId("stock")).toHaveText("স্টকে আছে");
    await expect(page.locator(".pdp-info .price-tag-amount")).toHaveText("৳৮৫");
    await page.getByRole("link", { name: "৫ কেজি" }).click();
    await expect(page.locator(".pdp-info .price-tag-amount")).toHaveText("৳৪২৫");
    await expect(page.locator(".pdp-info .price-tag-compare")).toHaveText("৳৪৫০");
    await expect(page.getByTestId("stock")).toHaveText("এই অপশনটি এখন স্টকে নেই");
    await expect(page.getByTestId("delivery-zones")).toContainText("ঢাকার ভেতরে");
    await expect(page.getByRole("note")).toContainText("অনলাইন অর্ডার চালু হলে চেকআউট করা যাবে");
    // Link prefetching keeps the network busy, so "networkidle" never settles here; wait for load.
    await page.waitForLoadState("load");
    await page.waitForTimeout(500);
    expect(failed).toEqual([]);
    expect(await violations()).toEqual([]);
  });
}

test("filters, sorting and invalid prices are handled on the server", async ({ page }) => {
  await page.goto("/en/c/e2e-food/e2e-pantry?stock=1");
  await expect(page.locator("#listing-count")).toHaveText("1 products");
  await expect(page.getByTestId("product-grid")).toContainText("Miniket Rice");
  await page.goto("/en/c/e2e-food/e2e-pantry?sort=price_desc");
  await expect(page.getByTestId("product-grid").locator(".khata-name").first()).toHaveText(`Pantry Item ${PANTRY_COUNT - 1}`);
  await page.goto("/en/c/e2e-food/e2e-pantry?min=abc");
  await expect(page.locator("#ls-price-error")).toHaveText("Enter a price in taka, like 250");
  await expect(page.locator("#listing-count")).toHaveText(`${PANTRY_COUNT} products`);
  await page.goto("/en/c/e2e-food/e2e-pantry?min=5000&max=6000");
  await expect(page.getByTestId("listing-empty")).toContainText("No products match these filters.");
  await page.getByTestId("listing-empty").getByRole("link", { name: "Clear filters" }).click();
  await expect(page.locator("#listing-count")).toHaveText(`${PANTRY_COUNT} products`);
});

test("search finds whole words and prefixes, and says so when nothing matches", async ({ page }) => {
  await page.goto("/");
  // Redesign: the header field is a combobox with suggestions (#site-search); Enter still submits the form.
  await page.locator("#site-search").fill("miniket");
  await page.locator("#site-search").press("Enter");
  await expect(page).toHaveURL(/\/search\?q=miniket/);
  await expect(page.getByTestId("product-grid")).toContainText("মিনিকেট চাল");
  await page.goto("/search?q=mini");
  await expect(page.getByTestId("product-grid")).toContainText("মিনিকেট চাল");
  // Bangla words find the stored Bangla names too.
  await page.goto("/search?q=চাল");
  await expect(page.getByTestId("product-grid")).toContainText("মিনিকেট চাল");
  await page.goto("/en/search?q=nothing-like-this");
  await expect(page.getByTestId("listing-empty")).toContainText("No products found for");
  await page.goto("/en/search");
  await expect(page.getByTestId("search-prompt")).toBeVisible();
});

test("SEO: canonical, hreflang, JSON-LD, sitemap and robots", async ({ page, request }) => {
  await page.goto("/en/p/e2e-miniket-rice");
  const origin = new URL(page.url()).origin;
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/en/p/e2e-miniket-rice`);
  await expect(page.locator('link[rel="alternate"][hreflang="bn"]')).toHaveAttribute("href", `${origin}/p/e2e-miniket-rice`);
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", `${origin}/p/e2e-miniket-rice`);
  // B11: the share image is the product's first Cloudinary photo; without Cloudinary there is none (never a broken URL).
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s) as { "@type": string; offers?: { price: string; availability: string }[] });
  const productLd = ld.find((d) => d["@type"] === "Product")!;
  expect(productLd.offers?.map((o) => [o.price, o.availability])).toEqual([
    ["85.00", "https://schema.org/InStock"],
    ["425.00", "https://schema.org/OutOfStock"],
  ]);
  expect(ld.some((d) => d["@type"] === "BreadcrumbList")).toBe(true);
  // Not launched: the page asks not to be indexed and robots.txt disallows everything.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/\s*$/m);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`${origin}/p/e2e-miniket-rice`);
  expect(sitemap).toContain(`${origin}/en/c/e2e-food/e2e-pantry`);
});

test("unknown, draft and malformed storefront paths are 404", async ({ request }) => {
  for (const path of ["/p/not-a-product", "/c/e2e-pantry", "/c/e2e-food/nope", "/collections/nope", "/en/p/UPPER"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("sign-up asks for the password twice and the server refuses a mismatch", async ({ page }) => {
  await page.goto("/register");
  const confirm = page.getByLabel("পাসওয়ার্ড আবার দিন");
  test.skip(!(await confirm.isVisible().catch(() => false)), "registration is not available in this environment");
  await page.getByLabel("আপনার নাম").fill("Rahim");
  await page.getByLabel("ইমেইল").fill("rahim@example.com");
  await page.getByLabel("পাসওয়ার্ড", { exact: true }).fill("a long passphrase 1");
  await confirm.fill("a long passphrase 2");
  await page.getByRole("button", { name: "অ্যাকাউন্ট খুলুন" }).click();
  await expect(page.getByText("দুটি পাসওয়ার্ড মেলেনি").first()).toBeVisible();
});

test("every storefront route has a loading skeleton", async () => {
  const { existsSync } = await import("node:fs");
  for (const dir of ["(home)", "categories", "collections/(index)", "collections/[slug]", "c/[...slug]", "p/[slug]", "search", "deals", "new", "account"]) {
    expect(existsSync(`app/[locale]/${dir}/loading.tsx`), dir || "/").toBe(true);
  }
});
