// Proposal A1: the admin home "Work waiting" counts on a disposable replica set. Counts are exact up
// to the cap, use the existing list filters, and the order, message and return counts are index scans.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db, type Document } from "mongodb";
import { collections } from "@/lib/db/collections";
import { runMigrations } from "@/lib/db/migrate";
import { countWork, formatWorkCount, WORK_COUNT_CAP, WORK_COUNTS, type WorkCountKey } from "@/lib/admin/work-counts";
import { freshDb } from "./helpers";

let db: Db;
let cleanup: () => Promise<void>;
const def = (k: WorkCountKey) => WORK_COUNTS.find((d) => d.key === k)!;

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  const names = new Set(WORK_COUNTS.map((d) => d.collection));
  await runMigrations(db, { collections: collections.filter((c) => names.has(c.name)), adapterCollections: [], migrations: [] });
  // Minimal documents: validators are not under test here, so they are switched off for this database.
  const raw = (name: string) => db.collection(name);
  await db.command({ collMod: def("orders").collection, validationLevel: "off" });
  await db.command({ collMod: def("messages").collection, validationLevel: "off" });
  await db.command({ collMod: def("returns").collection, validationLevel: "off" });
  await db.command({ collMod: def("lowStock").collection, validationLevel: "off" });
  await raw(def("orders").collection).insertMany([
    ...Array.from({ length: 3 }, (_, i) => ({ orderNumber: `HB-261024-PEND0${i}`, userId: `u${i}`, checkoutKey: `k${i}`, status: "pending_confirmation", placedAt: new Date() })),
    { orderNumber: "HB-261024-CONF00", userId: "u9", checkoutKey: "k9", status: "confirmed", placedAt: new Date() },
  ]);
  await raw(def("messages").collection).insertMany([
    { userId: "u1", status: "open", lastMessageAt: new Date() },
    { userId: "u2", status: "closed", lastMessageAt: new Date() },
  ]);
  await raw(def("returns").collection).insertMany([
    { orderId: new ObjectId(), status: "requested", updatedAt: new Date() },
    { orderId: new ObjectId(), status: "approved", updatedAt: new Date() },
  ]);
  await raw(def("lowStock").collection).insertMany([
    { variantId: new ObjectId(), available: 2, lowStockThreshold: 5 },
    { variantId: new ObjectId(), available: 5, lowStockThreshold: 5 },
    { variantId: new ObjectId(), available: 50, lowStockThreshold: 5 },
  ]);
});

afterAll(async () => cleanup?.());

describe("work counts", () => {
  it("counts only what the linked list shows as waiting", async () => {
    expect(await countWork(db, def("orders"))).toBe(3);
    expect(await countWork(db, def("messages"))).toBe(1);
    expect(await countWork(db, def("returns"))).toBe(1);
    expect(await countWork(db, def("lowStock"))).toBe(2);
  });

  it("links each count to the existing filtered list", () => {
    expect(WORK_COUNTS.map((d) => [d.key, d.capability, d.href])).toEqual([
      ["orders", "orders.read", "/admin/orders?status=pending_confirmation"],
      ["messages", "messages.reply", "/admin/messages?status=open"],
      ["returns", "returns.process", "/admin/returns?status=requested"],
      ["lowStock", "inventory.adjust", "/admin/inventory?low=1"],
    ]);
  });

  it("stops counting at the cap and shows 99+", async () => {
    await db.collection(def("orders").collection).insertMany(Array.from({ length: WORK_COUNT_CAP + 20 }, (_, i) => ({ orderNumber: `HB-261024-B${String(i).padStart(5, "0")}`, userId: "bulk", checkoutKey: `b${i}`, status: "pending_confirmation", placedAt: new Date() })));
    const n = await countWork(db, def("orders"));
    expect(n).toBe(WORK_COUNT_CAP);
    expect(formatWorkCount(n)).toBe("99+");
    expect(formatWorkCount(99)).toBe("99");
    expect(formatWorkCount(0)).toBe("0");
  });

  it.each<WorkCountKey>(["orders", "messages", "returns"])("%s is an index scan, not a collection scan", async (k) => {
    const d = def(k);
    const e = (await db.command({ explain: { count: d.collection, query: d.filter, limit: WORK_COUNT_CAP }, verbosity: "queryPlanner" })) as Document;
    const stages: string[] = [];
    const walk = (n: Document | undefined) => {
      if (!n) return;
      stages.push(n.stage);
      walk(n.inputStage);
      for (const s of n.inputStages ?? []) walk(s);
    };
    walk(e.queryPlanner.winningPlan.queryPlan ?? e.queryPlanner.winningPlan);
    expect(stages.some((s) => s === "IXSCAN" || s === "COUNT_SCAN")).toBe(true);
    expect(stages).not.toContain("COLLSCAN");
  });

  it("surfaces database errors to the caller (the page shows Couldn't load, never 0)", async () => {
    const broken = { ...def("orders"), filter: { $bogus: 1 } };
    await expect(countWork(db, broken)).rejects.toThrow();
  });
});
