// POST /api/jobs/drain (SCHEMA.md; C-01 cron-job.org trigger, docs/JOBS.md): bearer CRON_SECRET in the
// Authorization header only, http trigger only, one drain at a time, at most one accepted per 30 s,
// counts only. Provider handlers are mocked: nothing here sends e-mail, push or courier requests.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { closeDatabase } from "@/lib/adapters/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { DRAIN_JOB_NAME, enqueueOutbox, type OutboxHandler } from "@/lib/modules/platform/outbox";
import { getHealthReport } from "@/lib/platform/health";
import { freshDb } from "./helpers";

const calls = vi.hoisted(() => ({ ok: 0, fail: 0, slow: 0 }));
const gate = vi.hoisted(() => ({ release: (): void => undefined, started: Promise.resolve() as Promise<void>, notifyStarted: (): void => undefined }));
vi.mock("@/lib/adapters/jobs/handlers", () => {
  const handlers: Record<string, OutboxHandler> = {
    "test.ok": async (job) => {
      calls.ok++;
      return { providerRef: `ref-${job.idempotencyKey}` };
    },
    "test.fail": async () => {
      calls.fail++;
      throw new Error("provider refused (mock)");
    },
    "test.slow": async () => {
      calls.slow++;
      gate.notifyStarted();
      await new Promise<void>((resolve) => (gate.release = resolve));
      return {};
    },
  };
  return { outboxHandlers: handlers };
});

// 44 characters, the shape `openssl rand -base64 32` produces. Test-only value.
const SECRET = "dGVzdC1jcm9uLXNlY3JldC0wMTIzNDU2Nzg5YWJjZGVm";
let db: Db;
let uri: string;
let dbName: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, uri, dbName, cleanup } = await freshDb());
  await runMigrations(db);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await closeDatabase();
  await cleanup();
});

const configure = () => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("JOBS_TRIGGER", "http");
  vi.stubEnv("MONGODB_URI", uri);
  vi.stubEnv("MONGODB_DB", dbName);
};
const reset = async () => {
  await db.collection("jobs").deleteMany({});
  await db.collection("outbox").deleteMany({});
  calls.ok = 0;
  calls.fail = 0;
  calls.slow = 0;
};

const call = async (auth?: string, url = "https://shop.example/api/jobs/drain") => {
  const { POST } = await import("@/app/api/jobs/drain/route");
  const res = await POST(new Request(url, { method: "POST", headers: auth ? { authorization: auth } : {} }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const drainJob = () => db.collection("jobs").findOne({ name: DRAIN_JOB_NAME });

describe("POST /api/jobs/drain: configuration and authentication", () => {
  beforeEach(reset);

  it("stays closed without CRON_SECRET or with one shorter than 32 characters", async () => {
    configure();
    vi.stubEnv("CRON_SECRET", "");
    expect(await call(`Bearer ${SECRET}`)).toEqual({ status: 503, body: { error: "not_configured" } });
    vi.stubEnv("CRON_SECRET", "short-but-sixteen-plus-0123");
    expect(await call("Bearer short-but-sixteen-plus-0123")).toEqual({ status: 503, body: { error: "not_configured" } });
    expect(await drainJob()).toBeNull();
  });

  it("refuses a missing, malformed or wrong Authorization header", async () => {
    configure();
    for (const header of [undefined, SECRET, `bearer ${SECRET}`, `Bearer  ${SECRET}`, `Basic ${SECRET}`, "Bearer ", `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`]) {
      expect((await call(header)).status, String(header)).toBe(401);
    }
    expect(await drainJob()).toBeNull();
  });

  it("refuses the secret (or anything) in the query string, even with a valid header", async () => {
    configure();
    expect(await call(`Bearer ${SECRET}`, `https://shop.example/api/jobs/drain?token=${SECRET}`)).toEqual({ status: 400, body: { error: "unexpected_query" } });
    expect(await call(undefined, `https://shop.example/api/jobs/drain?secret=${SECRET}`)).toEqual({ status: 400, body: { error: "unexpected_query" } });
    expect(await drainJob()).toBeNull();
  });

  it("refuses when the trigger is the worker", async () => {
    configure();
    vi.stubEnv("JOBS_TRIGGER", "worker");
    expect(await call(`Bearer ${SECRET}`)).toEqual({ status: 409, body: { error: "trigger_not_http" } });
  });

  it("answers GET with 405", async () => {
    const { GET } = await import("@/app/api/jobs/drain/route");
    expect(GET().status).toBe(405);
  });
});

describe("POST /api/jobs/drain: processing", () => {
  beforeEach(async () => {
    await reset();
    configure();
  });

  it("drains with the right bearer and returns counts only", async () => {
    await enqueueOutbox(db, { type: "test.ok", aggregateId: "a", seq: 1, payload: { to: "customer@example.com", secret: "never-returned" } });
    const r = await call(`Bearer ${SECRET}`);
    expect(r).toMatchObject({ status: 200, body: { ok: true, claimed: 1, done: 1, retried: 0, dead: 0 } });
    expect(Object.keys(r.body).sort()).toEqual(["claimed", "dead", "done", "durationMs", "ok", "retried"]);
    expect(JSON.stringify(r.body)).not.toMatch(/never-returned|customer@example\.com/);
    expect(calls.ok).toBe(1);
  });

  it("counts partial failures: a claimed row is not reported as delivered", async () => {
    await enqueueOutbox(db, { type: "test.ok", aggregateId: "a", seq: 1, payload: {} });
    await enqueueOutbox(db, { type: "test.fail", aggregateId: "b", seq: 1, payload: {} });
    await enqueueOutbox(db, { type: "test.unregistered", aggregateId: "c", seq: 1, payload: {} });
    const r = await call(`Bearer ${SECRET}`);
    expect(r).toMatchObject({ status: 200, body: { ok: true, claimed: 3, done: 1, retried: 2, dead: 0 } });
    const rows = await db.collection("outbox").find({}, { projection: { type: 1, status: 1, attempts: 1, availableAt: 1, lastError: 1 } }).toArray();
    const byType = Object.fromEntries(rows.map((row) => [row.type, row]));
    expect(byType["test.ok"]).toMatchObject({ status: "done" });
    expect(byType["test.fail"]).toMatchObject({ status: "failed", attempts: 1 });
    expect((byType["test.fail"]!.availableAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(byType["test.unregistered"]).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("dead-letters a row on its 8th failed attempt", async () => {
    await enqueueOutbox(db, { type: "test.fail", aggregateId: "d", seq: 1, payload: {} });
    await db.collection("outbox").updateOne({ type: "test.fail" }, { $set: { attempts: 7 } });
    const r = await call(`Bearer ${SECRET}`);
    expect(r.body).toMatchObject({ ok: true, claimed: 1, done: 0, retried: 0, dead: 1 });
    expect(await db.collection("outbox").findOne({ type: "test.fail" })).toMatchObject({ status: "dead", attempts: 8 });
  });

  it("skips a call inside the 30 s interval without processing, then accepts once the interval has passed", async () => {
    expect((await call(`Bearer ${SECRET}`)).body).toMatchObject({ ok: true, claimed: 0 });
    await enqueueOutbox(db, { type: "test.ok", aggregateId: "e", seq: 1, payload: {} });
    expect(await call(`Bearer ${SECRET}`)).toEqual({ status: 200, body: { ok: true, skipped: "interval" } });
    expect(calls.ok).toBe(0);
    expect(await db.collection("outbox").findOne({ type: "test.ok" })).toMatchObject({ status: "pending", attempts: 0 });

    await db.collection("jobs").updateOne({ name: DRAIN_JOB_NAME }, { $set: { lastAcceptedAt: new Date(Date.now() - 31_000) } });
    expect((await call(`Bearer ${SECRET}`)).body).toMatchObject({ ok: true, claimed: 1, done: 1 });
    expect(await drainJob()).toMatchObject({ accepted: 2, skippedInterval: 1, lastSkipReason: "interval" });
  });

  it("skips while another drain holds the lock, and reclaims an expired lock", async () => {
    await enqueueOutbox(db, { type: "test.ok", aggregateId: "f", seq: 1, payload: {} });
    await db.collection("jobs").insertOne({ name: DRAIN_JOB_NAME, lockUntil: new Date(Date.now() + 60_000), lockOwner: "http-other", lastAcceptedAt: new Date(Date.now() - 120_000) });
    expect(await call(`Bearer ${SECRET}`)).toEqual({ status: 200, body: { ok: true, skipped: "locked" } });
    expect(calls.ok).toBe(0);
    expect(await drainJob()).toMatchObject({ lockOwner: "http-other", skippedLocked: 1, lastSkipReason: "locked" });

    // The other drain died (function timeout) and its lock ran out.
    await db.collection("jobs").updateOne({ name: DRAIN_JOB_NAME }, { $set: { lockUntil: new Date(Date.now() - 1) } });
    expect((await call(`Bearer ${SECRET}`)).body).toMatchObject({ ok: true, claimed: 1, done: 1 });
    const after = await drainJob();
    expect(after?.lockUntil).toBeUndefined();
    expect(after?.lockOwner).toBeUndefined();
  });

  it("accepts exactly one of several simultaneous calls (first run, upsert race)", async () => {
    for (let i = 0; i < 5; i++) await enqueueOutbox(db, { type: "test.ok", aggregateId: `g${i}`, seq: 1, payload: {} });
    const results = await Promise.all(Array.from({ length: 6 }, () => call(`Bearer ${SECRET}`)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const accepted = results.filter((r) => !("skipped" in r.body));
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.body).toMatchObject({ claimed: 5, done: 5 });
    expect(calls.ok).toBe(5);
    expect(await db.collection("jobs").countDocuments({ name: DRAIN_JOB_NAME })).toBe(1);
    const job = await drainJob();
    expect(job).toMatchObject({ accepted: 1 });
    expect((job?.skippedLocked ?? 0) + (job?.skippedInterval ?? 0)).toBe(5);
  });

  it("an overlapping call during a running drain is skipped as locked, and the lock is released afterwards", async () => {
    await enqueueOutbox(db, { type: "test.slow", aggregateId: "h", seq: 1, payload: {} });
    gate.started = new Promise<void>((resolve) => (gate.notifyStarted = resolve));
    const first = call(`Bearer ${SECRET}`);
    await gate.started;
    // Even with the interval satisfied, the held lock refuses the second call.
    await db.collection("jobs").updateOne({ name: DRAIN_JOB_NAME }, { $set: { lastAcceptedAt: new Date(Date.now() - 60_000) } });
    expect(await call(`Bearer ${SECRET}`)).toEqual({ status: 200, body: { ok: true, skipped: "locked" } });
    gate.release();
    expect((await first).body).toMatchObject({ ok: true, claimed: 1, done: 1 });
    expect(calls.slow).toBe(1);
    expect((await drainJob())?.lockUntil).toBeUndefined();
  });

  it("releases the lock and answers 500 when the drain itself fails", async () => {
    const outbox = await import("@/lib/modules/platform/outbox");
    const spy = vi.spyOn(outbox, "drainOutbox").mockRejectedValueOnce(new Error("database went away (mock)"));
    try {
      const r = await call(`Bearer ${SECRET}`);
      expect(r).toEqual({ status: 500, body: { error: "drain_failed" } });
      const job = await drainJob();
      expect(job?.lockUntil).toBeUndefined();
      expect(job?.accepted).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("records the run as counts and operational metadata only, visible in the health report", async () => {
    await enqueueOutbox(db, { type: "test.fail", aggregateId: "i", seq: 1, payload: { to: "customer@example.com", phone: "01700000000" } });
    await call(`Bearer ${SECRET}`);
    await call(`Bearer ${SECRET}`); // inside the interval: skipped
    const job = await drainJob();
    expect(Object.keys(job!).sort()).toEqual(["_id", "accepted", "lastAcceptedAt", "lastResult", "lastRunAt", "lastSkipReason", "lastSkippedAt", "lastSuccessAt", "name", "skippedInterval"]);
    expect(job!.lastResult).toMatchObject({ ok: true, trigger: "http", claimed: 1, done: 0, retried: 1, dead: 0 });
    const stored = JSON.stringify(job);
    expect(stored).not.toMatch(/customer@example\.com|01700000000|provider refused/);
    expect(stored).not.toContain(SECRET);

    const report = await getHealthReport({ ...process.env, MONGODB_URI: uri, MONGODB_DB: dbName, JOBS_TRIGGER: "http", CRON_SECRET: SECRET, NODE_ENV: "development" });
    expect(report.database).toBe("connected");
    expect(report.jobs.outbox).toMatchObject({ pending: 1, accepted: 1, skippedLocked: 0, skippedInterval: 1 });
    expect(report.jobs.outbox?.lastSuccessAt).toBeInstanceOf(Date);
    expect(report.jobs.outbox?.lastSkippedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(report)).not.toContain(uri);
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });
});
