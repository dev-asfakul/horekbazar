// B10 information and legal pages and the offline fallback, against the disposable database
// (scripts/e2e-db-server.mjs), in a browser. Owner text is not supplied, so every page shows
// [NEEDS COPY] and asks not to be indexed; /contact shows the saved store contact when there is one.
// The not-set-up state of these paths is covered by the zero-variable suite (tests/e2e/shell.spec.ts).
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { MongoClient, type Db } from "mongodb";
import type { Actor } from "@/lib/modules/catalogue/common";
import { getSettings, updateGeneralSettings } from "@/lib/modules/settings/settings";
import { watchCsp } from "../e2e/helpers";

let client: MongoClient;
let db: Db;
const actor: Actor = { id: "e2e-owner", role: "owner", ip: "203.0.113.20" };

const PAGES = [
  ["/about", "আমাদের সম্পর্কে", "About us"],
  ["/contact", "যোগাযোগ", "Contact"],
  ["/faq", "সচরাচর জিজ্ঞাসা", "Frequently asked questions"],
  ["/terms", "শর্তাবলি", "Terms and conditions"],
  ["/privacy-policy", "প্রাইভেসি পলিসি", "Privacy policy"],
  ["/delivery-policy", "ডেলিভারি পলিসি", "Delivery policy"],
  ["/return-policy", "রিটার্ন পলিসি", "Return policy"],
] as const;

async function setContact(contact: Awaited<ReturnType<typeof getSettings>>["store"]["contact"]) {
  const s = await getSettings(db);
  await updateGeneralSettings(db, actor, s.version, { store: { ...s.store, contact }, theme: s.theme, locale: s.locale, pricing: s.pricing, features: s.features });
}

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  // A set-up store: the installation record and saved settings with no contact details yet.
  await db.collection<{ _id: string }>("installation").updateOne({ _id: "installation" }, { $setOnInsert: { ownerUserId: "e2e-owner", ownerClaimedAt: new Date(), verification: "email" } }, { upsert: true });
  await setContact({});
});

test.afterAll(async () => {
  await setContact({});
  await client?.close();
});

test("each information and legal page exists in Bengali and English, shows [NEEDS COPY] and is not indexed", async ({ page }) => {
  const violations = await watchCsp(page);
  for (const [path, bn, en] of PAGES) {
    for (const [prefix, lang, title] of [
      ["", "bn", bn],
      ["/en", "en", en],
    ] as const) {
      const response = await page.goto(`${prefix}${path}`);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator("[data-needs-copy]").first()).toContainText("[NEEDS COPY]");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${prefix}${path}$`));
    }
  }
  // The footer links to the information pages and the policies on every page.
  await page.goto("/");
  const footer = page.locator("#site-footer");
  for (const path of ["/about", "/contact", "/faq", "/terms", "/privacy-policy", "/delivery-policy", "/return-policy"]) {
    await expect(footer.locator(`a[href="${path}"]`)).toHaveCount(1);
  }
  expect(await violations()).toEqual([]);
});

test("/contact shows [NEEDS COPY] for missing details and the saved store contact once it is set", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/contact");
  for (const id of ["contact-phone", "contact-email", "contact-address", "contact-hours"]) {
    await expect(page.getByTestId(id)).toContainText("[NEEDS COPY]");
  }
  await expect(page.getByRole("link", { name: "মেসেজ খুলুন" })).toHaveAttribute("href", "/account/messages");

  await setContact({ phone: "01712345678", email: "help@shop.example", address: { bn: "১২ মেইন রোড, ঢাকা", en: "12 Main Road, Dhaka" }, hours: { bn: "সকাল ১০টা – রাত ৮টা", en: "10 am – 8 pm" } });
  await page.reload();
  await expect(page.getByTestId("contact-phone").getByRole("link")).toHaveAttribute("href", "tel:+8801712345678");
  await expect(page.getByTestId("contact-email").getByRole("link")).toHaveAttribute("href", "mailto:help@shop.example");
  await expect(page.getByTestId("contact-address")).toHaveText("১২ মেইন রোড, ঢাকা");
  await expect(page.getByTestId("contact-hours")).toHaveText("সকাল ১০টা – রাত ৮টা");
  // The complaint procedure is legal text: still [NEEDS COPY] until the owner supplies it.
  await expect(page.locator("[data-needs-copy]")).toHaveCount(1);
  await page.goto("/en/contact");
  await expect(page.getByTestId("contact-address")).toHaveText("12 Main Road, Dhaka");
  // No sideways scrolling at 375 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("offline: a failed page load shows the offline page in the page's language; the admin is never served from it", async ({ page, context }) => {
  await page.goto("/");
  // The worker installs on the first visit (no permission prompt) and stores the offline pages.
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return Boolean(reg?.active) && (await caches.has("offline-v1"));
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  try {
    await context.setOffline(true);
    await page.goto("/categories");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ইন্টারনেট কানেকশন নেই");
    await expect(page).toHaveURL(/\/categories$/);
    await page.goto("/en/search?q=rice");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're offline");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.goto("/admin")).rejects.toThrow();
  } finally {
    await context.setOffline(false);
  }
  await page.goto("/categories");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("ইন্টারনেট কানেকশন নেই");
});
