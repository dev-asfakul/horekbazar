// domain-rules §13: atomic leased claims, reclaim after a crash, idempotent enqueue inside a
// transaction, backoff and dead-lettering, and honest drain records.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db, MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { recordAudit } from "@/lib/modules/platform/audit";
import { claimNext, completeJob, drainOutbox, enqueueOutbox, failJob, OUTBOX, outboxHealth, type OutboxHandler } from "@/lib/modules/platform/outbox";
import type { OutboxDoc } from "@/lib/modules/platform/schema";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
});
afterAll(async () => cleanup());
beforeEach(async () => {
  await db.collection(OUTBOX).deleteMany({});
  await db.collection("jobs").deleteMany({});
});

const outbox = () => db.collection<OutboxDoc>(OUTBOX);

describe("enqueue", () => {
  it("writes once per deterministic key, also when retried inside a transaction", async () => {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const a = await enqueueOutbox(db, { type: "email.order_placed", aggregateId: "ord1", seq: 1, payload: { orderId: "ord1" } }, { session });
        const b = await enqueueOutbox(db, { type: "email.order_placed", aggregateId: "ord1", seq: 1, payload: { orderId: "ord1" } }, { session });
        expect([a.enqueued, b.enqueued]).toEqual([true, false]);
      });
    } finally {
      await session.endSession();
    }
    expect(await outbox().countDocuments()).toBe(1);
  });

  it("rolls back with the business change when the transaction aborts", async () => {
    const session = client.startSession();
    await session
      .withTransaction(async () => {
        await enqueueOutbox(db, { type: "email.order_placed", aggregateId: "ord2", seq: 1, payload: {} }, { session });
        throw new Error("business rule failed");
      })
      .catch(() => undefined);
    await session.endSession();
    expect(await outbox().countDocuments()).toBe(0);
  });
});

describe("claims and leases", () => {
  it("concurrent drains process each row exactly once", async () => {
    for (let i = 0; i < 30; i++) await enqueueOutbox(db, { type: "test.ok", aggregateId: `a${i}`, seq: 1, payload: { i } });
    const seen: string[] = [];
    const handlers: Record<string, OutboxHandler> = { "test.ok": async (job) => (seen.push(job.idempotencyKey), { providerRef: `ref-${job.idempotencyKey}` }) };
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, w) => drainOutbox(db, handlers, { workerId: `w${w}`, trigger: "worker", budgetMs: 30_000 })),
    );
    expect(results.reduce((s, r) => s + r.done, 0)).toBe(30);
    expect(new Set(seen).size).toBe(30);
    expect(seen.length).toBe(30);
    expect(await outbox().countDocuments({ status: "done", providerRef: { $exists: true } })).toBe(30);
  });

  it("reclaims an expired lease after a crash, and the crashed worker cannot complete it", async () => {
    await enqueueOutbox(db, { type: "test.ok", aggregateId: "crash", seq: 1, payload: {} });
    const t0 = new Date();
    const first = await claimNext(db, { workerId: "crashed", leaseMs: 1_000, now: t0 });
    expect(first?.attempts).toBe(1);
    expect(await claimNext(db, { workerId: "other", now: new Date(t0.getTime() + 500) })).toBeNull();
    const second = await claimNext(db, { workerId: "other", now: new Date(t0.getTime() + 1_001) });
    expect(second?._id.equals(first!._id)).toBe(true);
    expect(second?.attempts).toBe(2);
    expect(await completeJob(db, first!._id, "crashed")).toBe(false);
    expect(await completeJob(db, first!._id, "other")).toBe(true);
  });

  it("backs off after a failure and moves the row to dead after maxAttempts", async () => {
    await enqueueOutbox(db, { type: "test.fail", aggregateId: "f", seq: 1, payload: {} });
    let now = new Date();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = await claimNext(db, { workerId: "w", now });
      expect(job?.attempts).toBe(attempt);
      const r = await failJob(db, job!, "w", new Error("provider said no; token=abc"), { maxAttempts: 3, now, random: 1 });
      expect(r.dead).toBe(attempt === 3);
      const row = await outbox().findOne({ _id: job!._id });
      if (attempt < 3) {
        expect(row?.status).toBe("failed");
        expect(row!.availableAt.getTime() - now.getTime()).toBe(30_000 * 2 ** (attempt - 1));
        expect(await claimNext(db, { workerId: "w", now })).toBeNull(); // not due yet
        now = new Date(row!.availableAt.getTime());
      } else {
        expect(row?.status).toBe("dead");
        expect(row?.lastError).not.toContain("abc");
      }
    }
    expect(await claimNext(db, { workerId: "w", now: new Date(now.getTime() + 86_400_000) })).toBeNull();
  });

  it("retries a row whose type has no handler instead of marking it done", async () => {
    await enqueueOutbox(db, { type: "email.unknown", aggregateId: "u", seq: 1, payload: {} });
    const r = await drainOutbox(db, {}, { workerId: "w", trigger: "http", budgetMs: 5_000 });
    expect(r).toMatchObject({ ok: true, claimed: 1, done: 0, retried: 1, dead: 0 });
    expect((await outbox().findOne({}))?.lastError).toBe("no handler registered for email.unknown");
  });
});

describe("monitoring", () => {
  it("records each drain and reports pending, dead and the last successful drain", async () => {
    await enqueueOutbox(db, { type: "test.later", aggregateId: "l", seq: 1, payload: {}, availableAt: new Date(Date.now() + 3_600_000) });
    const r = await drainOutbox(db, {}, { workerId: "w", trigger: "worker", budgetMs: 5_000 });
    expect(r.claimed).toBe(0);
    const health = await outboxHealth(db);
    expect(health.pending).toBe(1);
    expect(health.dead).toBe(0);
    expect(health.lastSuccessAt).toBeInstanceOf(Date);
    expect(health.lastResult?.trigger).toBe("worker");
  });

  it("audit rows pass the validator with redacted diffs and a truncated IP", async () => {
    await recordAudit(db, {
      actor: { id: "system", role: "system" },
      action: "settings.update",
      target: { type: "settings", id: "store" },
      before: { phone: "01700000000", status: "a" },
      after: { phone: "01800000000", status: "b" },
      ip: "203.0.113.9",
    });
    const row = await db.collection("auditLog").findOne({ action: "settings.update" });
    expect(row?.ip).toBe("203.0.113.0");
    expect(JSON.stringify(row)).not.toContain("01700000000");
  });
});
