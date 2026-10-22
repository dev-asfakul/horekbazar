// POST /api/webhooks/courier/[provider] (B8, I9): only Steadfast, only when configured, Bearer
// COURIER_WEBHOOK_SECRET, size-limited JSON; a duplicate delivery does nothing; responses carry the
// outcome only. The status applied is read from the courier's API (stubbed here with vi.stubGlobal).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { closeDatabase } from "@/lib/adapters/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { COURIER_EVENTS, SHIPMENTS, type ShipmentDoc } from "@/lib/modules/fulfilment/schema";
import { freshDb } from "./helpers";

const SECRET = "test-courier-secret-0123456789";
let db: Db;
let uri: string;
let dbName: string;
let cleanup: () => Promise<void>;

function configure(on = true) {
  vi.stubEnv("MONGODB_URI", uri);
  vi.stubEnv("MONGODB_DB", dbName);
  vi.stubEnv("STEADFAST_API_KEY", on ? "k" : "");
  vi.stubEnv("STEADFAST_SECRET_KEY", on ? "s" : "");
  vi.stubEnv("COURIER_WEBHOOK_SECRET", SECRET);
}

const call = async (provider: string, body: unknown, auth?: string) => {
  const { POST } = await import("@/app/api/webhooks/courier/[provider]/route");
  const res = await POST(new Request(`http://localhost/api/webhooks/courier/${provider}`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ provider }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeAll(async () => {
  ({ db, uri, dbName, cleanup } = await freshDb());
  await runMigrations(db);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await closeDatabase();
  await cleanup();
});

describe("POST /api/webhooks/courier/[provider]", () => {
  it("refuses unknown couriers, an unconfigured deployment and a wrong or missing bearer", async () => {
    configure();
    expect((await call("pathao", {}, `Bearer ${SECRET}`)).status).toBe(404);
    configure(false);
    expect(await call("steadfast", {}, `Bearer ${SECRET}`)).toEqual({ status: 503, body: { error: "not_configured" } });
    configure();
    expect((await call("steadfast", { consignment_id: 1 })).status).toBe(401);
    expect((await call("steadfast", { consignment_id: 1 }, "Bearer wrong-secret-0123456789")).status).toBe(401);
    expect((await call("steadfast", "{not json", `Bearer ${SECRET}`)).status).toBe(400);
    expect((await call("steadfast", { consignment_id: "<x>" }, `Bearer ${SECRET}`)).status).toBe(400);
    expect((await call("steadfast", { consignment_id: 1, tracking_message: "x".repeat(20_000) }, `Bearer ${SECRET}`)).status).toBe(413);
  });

  it("applies the verified status once; a repeated delivery is a duplicate", async () => {
    configure();
    const shipmentId = new ObjectId();
    const now = new Date();
    const doc: ShipmentDoc = { _id: shipmentId, orderId: new ObjectId(), orderNumber: "ORD-T-1", courier: "steadfast", consignmentId: "777001", invoice: "ORD-T-1-1", codAmount: 10000, status: "handed_over", open: true, checkpoints: [{ code: "handed_over", source: "staff", at: now }], createdBy: { type: "staff", id: "s" }, version: 3, createdAt: now, updatedAt: now };
    await db.collection<ShipmentDoc>(SHIPMENTS).insertOne(doc);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ status: 200, delivery_status: "hold" }), { status: 200 }));
    const body = { notification_type: "delivery_status", consignment_id: 777001, status: "hold", updated_at: now.toISOString() };
    const first = await call("steadfast", body, `Bearer ${SECRET}`);
    expect(first).toEqual({ status: 200, body: { status: "success", outcome: "applied" } });
    expect(await call("steadfast", body, `Bearer ${SECRET}`)).toEqual({ status: 200, body: { status: "success", outcome: "duplicate" } });
    expect(await db.collection(COURIER_EVENTS).countDocuments({ consignmentId: "777001" })).toBe(1);
    expect((await db.collection<ShipmentDoc>(SHIPMENTS).findOne({ _id: shipmentId }))?.courierStatus?.code).toBe("hold");
  });
});
