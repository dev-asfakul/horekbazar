// B10 part c on a disposable replica set: the audit viewer filters, pages and re-redacts; the customer
// lookup excludes staff, counts orders in one query, and never returns credentials or session data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { AUDIT_PAGE_SIZE, listAuditLog } from "@/lib/modules/platform/audit-query";
import { AUDIT_LOG } from "@/lib/modules/platform/audit";
import { getCustomer, listCustomers } from "@/lib/modules/identity/customers";
import { freshDb } from "./helpers";

let db: Db;
let cleanup: () => Promise<void>;
const alice = new ObjectId();
const bob = new ObjectId();
const staff = new ObjectId();

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  const base = new Date("2026-10-20T06:00:00Z");
  const rows = Array.from({ length: AUDIT_PAGE_SIZE + 5 }, (_, i) => ({
    _id: new ObjectId(),
    actor: { id: i % 2 ? "staff-a" : "staff-b", role: "owner" },
    action: i % 3 ? "order.confirmed" : "catalogue.product_updated",
    target: { type: i % 3 ? "order" : "product", id: `T${i}` },
    after: { status: "confirmed" },
    at: new Date(base.getTime() + i * 60_000),
  }));
  // A row written before redaction existed (or by a buggy writer): the viewer must still hide it.
  rows.push({ _id: new ObjectId(), actor: { id: "legacy", role: "owner" }, action: "customer.updated", target: { type: "user", id: "u1" }, after: { email: "a@example.test", nested: { phone: "+8801711111111", password: "x" } } as never, at: new Date("2026-10-23T17:59:00Z") });
  await db.collection(AUDIT_LOG).insertMany(rows);

  await db.collection("user").insertMany([
    { _id: alice, name: "আলিয়া রহমান", email: "alice@example.test", emailVerified: true, phone: "+8801711000001", createdAt: new Date("2026-10-01"), updatedAt: new Date(), twoFactorEnabled: false },
    { _id: bob, name: "Bob Mia", email: "bob@example.test", emailVerified: false, createdAt: new Date("2026-10-02"), updatedAt: new Date() },
    { _id: staff, name: "Staff Person", email: "staff@example.test", emailVerified: true, staffRoleKey: "support_agent", createdAt: new Date("2026-10-03"), updatedAt: new Date() },
  ]);
  await db.collection("account").insertOne({ userId: alice, providerId: "credential", accountId: String(alice), password: "hash-must-not-leak" });
  await db.collection("orders").insertMany([
    { orderNumber: "HB-261020-AAAAAA", userId: String(alice), status: "confirmed", placedAt: new Date("2026-10-20"), totals: { grandTotal: 120000 } },
    { orderNumber: "HB-261021-BBBBBB", userId: String(alice), status: "delivered", placedAt: new Date("2026-10-21"), totals: { grandTotal: 50000 } },
  ]);
  await db.collection("addresses").insertOne({ userId: String(alice), label: "home", name: "আলিয়া", phone: "+8801711000001", zoneId: "dhaka", district: "ঢাকা", area: "মিরপুর", line: "রোড ১", isDefault: true, version: 1, createdAt: new Date(), updatedAt: new Date() });
});

afterAll(async () => {
  await cleanup?.();
});

describe("audit log viewer", () => {
  it("pages newest first and reports the total", async () => {
    const p1 = await listAuditLog(db, {}, 1);
    expect(p1.total).toBe(AUDIT_PAGE_SIZE + 6);
    expect(p1.rows).toHaveLength(AUDIT_PAGE_SIZE);
    expect(p1.pages).toBe(2);
    expect(p1.rows[0]!.action).toBe("customer.updated");
    const times = p1.rows.map((r) => r.at.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const p2 = await listAuditLog(db, {}, 2);
    expect(p2.rows).toHaveLength(6);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(AUDIT_PAGE_SIZE + 6);
    expect((await listAuditLog(db, {}, 9999)).page).toBeLessThanOrEqual(200);
  });
  it("filters by action prefix, actor, target and Dhaka dates", async () => {
    const orders = await listAuditLog(db, { action: "order." });
    expect(orders.rows.every((r) => r.action.startsWith("order."))).toBe(true);
    expect((await listAuditLog(db, { actorId: "staff-a" })).rows.every((r) => r.actor.id === "staff-a")).toBe(true);
    expect((await listAuditLog(db, { targetType: "product", targetId: "T0" })).total).toBe(1);
    // 2026-10-23T17:59Z is 23:59 on 23 Oct in Dhaka: inside "to 2026-10-23", outside "to 2026-10-22".
    expect((await listAuditLog(db, { from: "2026-10-23", to: "2026-10-23" })).total).toBe(1);
    expect((await listAuditLog(db, { from: "2026-10-22", to: "2026-10-22" })).total).toBe(0);
  });
  it("re-redacts personal and secret values on read", async () => {
    const [row] = (await listAuditLog(db, { action: "customer.updated" })).rows;
    expect(JSON.stringify(row)).not.toContain("a@example.test");
    expect(JSON.stringify(row)).not.toContain("+8801711111111");
    expect(row!.after).toEqual({ email: "[redacted]", nested: { phone: "[redacted]", password: "[redacted]" } });
  });
});

describe("customer lookup", () => {
  it("lists shoppers only, newest first, with their order counts", async () => {
    const { customers, total } = await listCustomers(db, "");
    expect(total).toBe(2);
    expect(customers.map((c) => c.email)).toEqual(["bob@example.test", "alice@example.test"]);
    expect(customers.find((c) => c.email === "alice@example.test")!.orders).toBe(2);
    expect(customers.find((c) => c.email === "bob@example.test")!.orders).toBe(0);
  });
  it("searches name, e-mail and phone literally", async () => {
    expect((await listCustomers(db, "আলিয়া")).customers.map((c) => c.email)).toEqual(["alice@example.test"]);
    expect((await listCustomers(db, "01711000001")).customers.map((c) => c.email)).toEqual(["alice@example.test"]);
    expect((await listCustomers(db, ".*")).total).toBe(0);
    expect((await listCustomers(db, "staff@example.test")).total).toBe(0);
  });
  it("detail: account, addresses and orders, never credentials; staff and unknown ids are not found", async () => {
    const c = await getCustomer(db, String(alice));
    expect(c?.addresses).toHaveLength(1);
    expect(c?.recentOrders.map((o) => o.orderNumber)).toEqual(["HB-261021-BBBBBB", "HB-261020-AAAAAA"]);
    expect(JSON.stringify(c)).not.toContain("hash-must-not-leak");
    expect(await getCustomer(db, String(staff))).toBeNull();
    expect(await getCustomer(db, String(new ObjectId()))).toBeNull();
    expect(await getCustomer(db, "not-an-id")).toBeNull();
  });
});
