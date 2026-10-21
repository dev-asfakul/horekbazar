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
  catalogueLocks: {
    valid: { _id: "categoryTree", seq: 1, updatedAt: now },
    invalid: { _id: "anything", seq: 0, updatedAt: now },
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
