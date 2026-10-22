// domain-rules §14 CI checks 2 and 3: apply migrations, compare live validators with the generated
// ones, and prove each collection rejects a known-invalid document. Migrations are idempotent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoServerError, ObjectId, type Db } from "mongodb";
import { adapterCollections, collections } from "@/lib/db/collections";
import { runMigrations } from "@/lib/db/migrate";
import { validatorFor } from "@/lib/db/validators";
import { freshDb } from "./helpers";

let db: Db;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ db, cleanup } = await freshDb()));
afterAll(async () => cleanup());

const now = new Date();
/** One valid and one known-invalid document per collection. */
const fixtures: Record<string, { valid: Record<string, unknown>; invalid: Record<string, unknown> }> = {
  staffRoles: {
    valid: { _id: new ObjectId(), key: "fixture_role", name: { bn: "পরীক্ষা", en: "Fixture" }, capabilities: ["orders.read"], builtIn: false, twoFactorRequired: false, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), key: "Fixture Role", name: { bn: "" }, capabilities: ["orders.everything"], builtIn: false, twoFactorRequired: false, createdAt: now, updatedAt: now },
  },
  installation: {
    valid: { _id: "installation", ownerUserId: "pending-fixture", ownerClaimedAt: now, verification: "email" },
    invalid: { _id: "installation-2", ownerUserId: "", ownerClaimedAt: "now", verification: "server" },
  },
  outbox: {
    valid: { _id: new ObjectId(), type: "email.test", payload: {}, idempotencyKey: "email.test:a1:1", status: "pending", attempts: 0, availableAt: now, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), type: "email.test", payload: {}, idempotencyKey: "email.test:a2:1", status: "sent", attempts: -1, availableAt: "now", createdAt: now, updatedAt: now },
  },
  auditLog: {
    valid: { _id: new ObjectId(), actor: { id: "system", role: "system" }, action: "platform.migrate", target: { type: "database", id: "x" }, at: now },
    invalid: { _id: new ObjectId(), actor: { id: "system" }, action: "Platform Migrate", target: { type: "database", id: "x" }, at: now, extra: true },
  },
  jobs: {
    valid: { _id: new ObjectId(), name: "outbox-drain", lastRunAt: now, lastResult: { ok: true, trigger: "worker", claimed: 0, done: 0, retried: 0, dead: 0, durationMs: 1 } },
    invalid: { _id: new ObjectId(), name: "outbox-drain-2", lastRunAt: now, lastResult: { ok: "yes" } },
  },
  migrations: {
    valid: { _id: "0001-test", appliedAt: now },
    invalid: { _id: "not a migration id", appliedAt: now },
  },
  categories: {
    valid: { _id: new ObjectId(), slug: "rice-and-flour", parentId: null, name: { bn: "চাল ও আটা", en: "Rice & Flour" }, position: 1, status: "draft", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), slug: "Rice Flour", parentId: "grocery", name: { bn: "" }, position: -1, status: "live", version: 0, createdAt: now, updatedAt: now },
  },
  products: {
    valid: { _id: new ObjectId(), slug: "miniket-rice", name: { bn: "মিনিকেট চাল" }, primaryCategoryId: new ObjectId(), categoryIds: [new ObjectId()], attributes: [], media: [], status: "draft", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), slug: "miniket-rice-2", name: { bn: "মিনিকেট চাল" }, primaryCategoryId: new ObjectId(), categoryIds: [], attributes: [], media: [], status: "draft", version: 1, createdAt: now, updatedAt: now, rating: 5 },
  },
  variants: {
    valid: { _id: new ObjectId(), productId: new ObjectId(), sku: "HB-GRC-001-1KG", title: { bn: "১ কেজি" }, options: [], price: { amountMinor: 8500, currency: "BDT" }, position: 0, status: "active", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), productId: new ObjectId(), sku: "hb-lower", title: { bn: "১ কেজি" }, options: [], price: { amountMinor: 85.5, currency: "USD" }, position: 0, status: "active", version: 1, createdAt: now, updatedAt: now },
  },
  stock: {
    valid: { _id: new ObjectId(), variantId: new ObjectId(), onHand: 0, reserved: 0, available: 0, lowStockThreshold: 5, version: 1, updatedAt: now },
    invalid: { _id: new ObjectId(), variantId: new ObjectId(), onHand: 1, reserved: 2, available: -1, lowStockThreshold: 5, version: 1, updatedAt: now },
  },
  inventoryLedger: {
    valid: { _id: new ObjectId(), variantId: new ObjectId(), kind: "receive", qty: 5, onHandAfter: 5, reservedAfter: 0, actor: { type: "staff", id: "u1" }, refType: "stock", refId: "adj12345", lineRef: "v1", idempotencyKey: "stock:adj12345:v1:receive", createdAt: now },
    invalid: { _id: new ObjectId(), variantId: new ObjectId(), kind: "receive", qty: 5, onHandAfter: 5, reservedAfter: 0, actor: { type: "staff", id: "u1" }, refType: "stock", refId: "adj12345", lineRef: "v1", idempotencyKey: "adj12345:receive", createdAt: now },
  },
  settings: {
    valid: { _id: "settings", store: { name: { bn: "হরেকবাজার" }, contact: {} }, theme: { fontPreset: "khata", accent: "#1E4E9C" }, locale: { default: "bn", numerals: "bengali", grouping: "south_asian" }, delivery: { zones: [] }, pricing: { roundingUnit: 100 }, features: { wishlist: false, brands: false, reviews: false }, version: 1, updatedAt: now },
    invalid: { _id: "settings-2", store: { name: { bn: "হরেকবাজার" }, contact: {} }, theme: { fontPreset: "comic", accent: "blue" }, locale: { default: "bn", numerals: "bengali", grouping: "south_asian" }, delivery: { zones: [] }, pricing: { roundingUnit: 100 }, features: { wishlist: false, brands: false, reviews: false }, version: 1, updatedAt: now },
  },
  collections: {
    valid: { _id: new ObjectId(), slug: "eid-essentials", name: { bn: "ঈদের প্রয়োজনীয়" }, kind: "manual", productIds: [], status: "draft", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), slug: "eid-essentials-2", name: { bn: "ঈদের প্রয়োজনীয়" }, kind: "smart", productIds: ["x"], status: "draft", version: 1, createdAt: now, updatedAt: now },
  },
  homeSections: {
    valid: { _id: new ObjectId(), type: "richText", order: 1, data: { body: { bn: "স্বাগতম" } }, status: "draft", version: 1, createdAt: now, updatedAt: now },
    // A banner section carrying rich-text data: the union rejects data that does not match the type.
    invalid: { _id: new ObjectId(), type: "banner", order: 1, data: { body: { bn: "স্বাগতম" } }, status: "draft", version: 1, createdAt: now, updatedAt: now },
  },
  banners: {
    valid: { _id: new ObjectId(), image: { publicId: "horekbazar/banners/eid", rights: "Own photo, 2026" }, alt: { bn: "ঈদের অফার" }, href: "/c/grocery", placement: "home_top", status: "draft", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), image: { publicId: "horekbazar/banners/eid", rights: "" }, alt: { bn: "ঈদের অফার" }, href: "https://evil.example", placement: "home_top", status: "draft", version: 1, createdAt: now, updatedAt: now },
  },
  catalogueLocks: {
    valid: { _id: "categoryTree", seq: 1, updatedAt: now },
    invalid: { _id: "anything", seq: 0, updatedAt: now },
  },
  addresses: {
    valid: { _id: new ObjectId(), userId: "u1", label: "home", name: "রহিম", phone: "+8801712345678", zoneId: "dhaka", district: "ঢাকা", area: "মিরপুর", line: "রোড ৩", isDefault: true, version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), userId: "u1", label: "home", name: "রহিম", phone: "01712345678", zoneId: "dhaka", district: "ঢাকা", area: "মিরপুর", line: "রোড ৩", isDefault: true, version: 1, createdAt: now, updatedAt: now },
  },
  orders: {
    valid: { _id: new ObjectId(), orderNumber: "ORD-261022-ABC234", userId: "u1", customer: { name: "রহিম", email: "r@example.com" }, status: "pending_confirmation", lines: [{ lineId: "a".repeat(24), variantId: new ObjectId(), productId: new ObjectId(), sku: "S-1", slug: "rice", name: { bn: "চাল" }, variantTitle: { bn: "৫ কেজি" }, options: [], basePrice: 100, unitPrice: 100, quantity: 1, lineTotal: 100, couponShare: 0, status: "active" }], address: { label: "home", name: "রহিম", phone: "+8801712345678", zoneId: "dhaka", zoneName: { bn: "ঢাকা" }, district: "ঢাকা", area: "মিরপুর", line: "রোড ৩" }, delivery: { zoneId: "dhaka", fee: 60, baseFee: 60 }, totals: { merchandise: 100, savings: 0, coupon: 0, rewards: 0, delivery: 60, grandTotal: 160 }, paymentMethod: "cod", locale: "bn", checkoutKey: "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f", version: 1, placedAt: now, statusChangedAt: now, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), orderNumber: "1", userId: "u1", customer: { name: "রহিম", email: "r@example.com" }, status: "shipping", lines: [], paymentMethod: "card", locale: "bn", checkoutKey: "x", version: 0, placedAt: now, statusChangedAt: now, createdAt: now, updatedAt: now },
  },
  shipments: {
    valid: { _id: new ObjectId(), orderId: new ObjectId(), orderNumber: "ORD-261022-ABC234", courier: "manual", carrierName: "Local rider", invoice: "ORD-261022-ABC234-1", codAmount: 160, status: "draft", open: true, checkpoints: [{ code: "draft", source: "staff", at: now }], createdBy: { type: "staff", id: "s1" }, version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), orderId: new ObjectId(), orderNumber: "ORD-261022-ABC234", courier: "dhl", invoice: "x", codAmount: -1, status: "lost", open: true, checkpoints: [], createdBy: { type: "staff", id: "s1" }, version: 0, createdAt: now, updatedAt: now },
  },
  courierEvents: {
    valid: { _id: new ObjectId(), provider: "steadfast", eventId: "a".repeat(64), consignmentId: "1424107", claimedStatus: "delivered", outcome: "received", receivedAt: now },
    invalid: { _id: new ObjectId(), provider: "steadfast", eventId: "not-a-hash", consignmentId: "1424107", outcome: "accepted", receivedAt: now },
  },
  returns: {
    valid: { _id: new ObjectId(), orderId: new ObjectId(), orderNumber: "ORD-261022-ABC234", userId: "u1", lines: [{ lineId: "a".repeat(24), variantId: new ObjectId(), qty: 1 }], reason: "প্যাকেট ছেঁড়া", status: "requested", history: [{ from: "new", to: "requested", by: { type: "customer", id: "u1" }, at: now }], version: 1, requestedAt: now, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), orderId: new ObjectId(), orderNumber: "ORD-261022-ABC234", userId: "u1", lines: [{ lineId: "a".repeat(24), variantId: new ObjectId(), qty: 0 }], reason: "", status: "pending", history: [], version: 1, requestedAt: now, createdAt: now, updatedAt: now },
  },
  reservations: {
    valid: { _id: new ObjectId(), orderId: new ObjectId(), lineId: "a".repeat(24), variantId: new ObjectId(), qty: 1, status: "active", createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), orderId: new ObjectId(), lineId: "a".repeat(24), variantId: new ObjectId(), qty: 0, status: "held", createdAt: now, updatedAt: now },
  },
  orderEvents: {
    valid: { _id: new ObjectId(), orderId: new ObjectId(), seq: 1, from: "placed", to: "pending_confirmation", actor: { type: "customer", id: "u1" }, createdAt: now },
    invalid: { _id: new ObjectId(), orderId: new ObjectId(), seq: 0, from: "placed", to: "lost", actor: { type: "customer", id: "u1" }, createdAt: now },
  },
  idempotencyKeys: {
    valid: { _id: new ObjectId(), scope: "checkout", principalId: "u1", key: "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f", fingerprint: "a".repeat(64), expiresAt: now, createdAt: now },
    invalid: { _id: new ObjectId(), scope: "checkout", principalId: "u1", key: "not-a-uuid", fingerprint: "short", expiresAt: now, createdAt: now },
  },
  promotions: {
    valid: { _id: new ObjectId(), name: { bn: "অফার" }, kind: "flash_sale", discount: { type: "percent", value: 10 }, scope: { type: "all", ids: [] }, startsAt: now, endsAt: now, sold: 0, status: "draft", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), name: { bn: "অফার" }, kind: "flash_sale", discount: { type: "percent", value: 0 }, scope: { type: "all", ids: [] }, startsAt: now, sold: -1, status: "draft", version: 1, createdAt: now, updatedAt: now },
  },
  coupons: {
    valid: { _id: new ObjectId(), code: "SAVE10", kind: "percent", value: 10, used: 0, startsAt: now, eligibility: { firstOrderOnly: false, categoryIds: [], productIds: [], excludeCategoryIds: [], excludeProductIds: [], zoneIds: [] }, status: "active", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), code: "save 10", kind: "percent", value: 10, used: 0, startsAt: now, eligibility: { firstOrderOnly: false, categoryIds: [], productIds: [], excludeCategoryIds: [], excludeProductIds: [], zoneIds: [] }, status: "active", version: 1, createdAt: now, updatedAt: now },
  },
  couponRedemptions: {
    valid: { _id: new ObjectId(), couponId: new ObjectId(), userId: "u1", orderId: new ObjectId(), amount: 100, status: "held", createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), couponId: new ObjectId(), userId: "u1", orderId: new ObjectId(), amount: -1, status: "spent", createdAt: now, updatedAt: now },
  },
  couponCustomerUsage: {
    valid: { _id: new ObjectId(), couponId: new ObjectId(), userId: "u1", count: 1, updatedAt: now },
    invalid: { _id: new ObjectId(), couponId: new ObjectId(), userId: "u1", count: -1, updatedAt: now },
  },
  carts: {
    valid: { _id: new ObjectId(), userId: "u1", lines: [{ variantId: new ObjectId(), quantity: 2, addedAt: now }], status: "active", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), userId: "u1", lines: [{ variantId: new ObjectId(), quantity: 0, addedAt: now }], status: "active", version: 1, createdAt: now, updatedAt: now },
  },
  reviews: {
    valid: { _id: new ObjectId(), userId: "u1", productId: new ObjectId(), orderId: new ObjectId(), lineId: "a".repeat(24), rating: 5, body: "ভালো চাল", authorName: "রহিম", status: "pending", version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), userId: "u1", productId: new ObjectId(), orderId: new ObjectId(), lineId: "line-1", rating: 6, body: "", authorName: "রহিম", status: "approved", version: 1, createdAt: now, updatedAt: now },
  },
  rewardLedger: {
    valid: { _id: new ObjectId(), userId: "u1", kind: "accrue", points: 12, orderId: new ObjectId(), basisMinor: 120000, expiresAt: now, actor: { type: "system", id: "orders" }, idempotencyKey: "reward:accrue:o1", createdAt: now },
    invalid: { _id: new ObjectId(), userId: "u1", kind: "gift", points: 1.5, actor: { type: "customer", id: "u1" }, idempotencyKey: "", createdAt: now },
  },
  rewardLocks: {
    valid: { _id: "u1", seq: 1, updatedAt: now },
    invalid: { _id: "u1", seq: 0, updatedAt: now, balance: 10 },
  },
  conversations: {
    valid: { _id: new ObjectId(), userId: "u1", customerName: "রহিম", subject: "ডেলিভারি", status: "open", lastMessageAt: now, lastFrom: "customer", unreadByStaff: 1, unreadByCustomer: 0, messageCount: 1, version: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), userId: "u1", customerName: "রহিম", subject: "ডেলিভারি", status: "pending", lastMessageAt: now, lastFrom: "bot", unreadByStaff: -1, unreadByCustomer: 0, messageCount: 501, version: 1, createdAt: now, updatedAt: now },
  },
  messages: {
    valid: { _id: new ObjectId(), conversationId: new ObjectId(), from: "customer", authorId: "u1", body: "কবে আসবে?", clientKey: "0123456789abcdef", createdAt: now },
    invalid: { _id: new ObjectId(), conversationId: new ObjectId(), from: "customer", authorId: "u1", body: "কবে আসবে?", clientKey: "short", createdAt: now },
  },
  pushSubscriptions: {
    valid: { _id: new ObjectId(), userId: "u1", endpoint: "https://push.example.test/abc", keys: { p256dh: "BAbc", auth: "xyz" }, topics: { orders: true, marketing: true }, consentAt: now, consentSource: "account", locale: "bn", createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), userId: "u1", endpoint: "http://push.example.test/abc", keys: { p256dh: "BAbc", auth: "xyz" }, topics: { orders: true, marketing: "yes" }, locale: "fr", createdAt: now, updatedAt: now },
  },
  campaigns: {
    valid: { _id: new ObjectId(), title: { bn: "অফার", en: "Offer" }, body: { bn: "চাল ১০% কম" }, url: "/c/rice", audience: "marketing_opt_in", status: "sent", recipients: 2, sentAt: now, sentBy: "staff-1", version: 2, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), title: { bn: "অ".repeat(61) }, body: { bn: "বার্তা" }, url: "https://evil.test", audience: "everyone", status: "draft", version: 0, createdAt: now, updatedAt: now },
  },
  emailLog: {
    valid: { _id: new ObjectId(), outboxKey: "email.send:order-1:1", toHash: "a".repeat(64), toMasked: "k***@example.com", template: "order-placed", status: "sent", providerId: "re_1", attempts: 1, createdAt: now, updatedAt: now },
    invalid: { _id: new ObjectId(), outboxKey: "email.send:order-1:1", to: "karim@example.com", toHash: "short", toMasked: "k***@example.com", template: "order-placed", status: "bounced", attempts: -1, createdAt: now, updatedAt: now },
  },
};

describe("db:migrate on a replica set", () => {
  it("creates every registered collection with its generated validator, then is a no-op", async () => {
    const first = await runMigrations(db);
    // Validated collections plus the Better Auth adapter collections (indexes only, no validator: B3).
    const all = [...collections.map((c) => c.name), ...adapterCollections.map((c) => c.name)].sort();
    expect(first.created.sort()).toEqual(all);
    const second = await runMigrations(db);
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.unchanged.sort()).toEqual(all);
    expect(await db.collection("staffRoles").countDocuments({ builtIn: true })).toBe(6);
  });

  it("live validators equal the generated ones (strict, error)", async () => {
    for (const spec of collections) {
      const [info] = await db.listCollections({ name: spec.name }).toArray();
      const options = (info as { options: Record<string, unknown> }).options;
      expect(options.validator, spec.name).toEqual(validatorFor(spec));
      expect(options.validationLevel).toBe("strict");
      expect(options.validationAction).toBe("error");
    }
  });

  it("creates the declared indexes, including the outbox idempotency key as unique", async () => {
    const indexes = await db.collection("outbox").indexes();
    expect(indexes.find((i) => i.name === "idempotencyKey_unique")?.unique).toBe(true);
    expect(indexes.some((i) => i.name === "status_availableAt")).toBe(true);
    expect((await db.collection("jobs").indexes()).find((i) => i.name === "name_unique")?.unique).toBe(true);
  });

  it.each(collections.map((c) => c.name))("%s accepts a valid document and rejects a known-invalid one", async (name) => {
    const fixture = fixtures[name];
    expect(fixture, `add a fixture for ${name}`).toBeDefined();
    await db.collection(name).insertOne(fixture!.valid as never);
    const error = await db
      .collection(name)
      .insertOne(fixture!.invalid as never)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MongoServerError);
    expect((error as MongoServerError).code).toBe(121); // DocumentValidationFailure
  });

  it("brings a drifted validator back with collMod", async () => {
    await db.command({ collMod: "jobs", validator: { $jsonSchema: { bsonType: "object" } }, validationLevel: "moderate" });
    const report = await runMigrations(db);
    expect(report.updated).toEqual(["jobs"]);
  });

  it("runs each one-time data migration once and records it", async () => {
    let runs = 0;
    const migrations = [{ id: "0002-count-runs", up: async () => void runs++ }];
    expect((await runMigrations(db, { migrations })).applied).toEqual(["0002-count-runs"]);
    expect((await runMigrations(db, { migrations })).applied).toEqual([]);
    expect(runs).toBe(1);
    expect(await db.collection("migrations").findOne({ _id: "0002-count-runs" as never })).not.toBeNull();
  });
});
