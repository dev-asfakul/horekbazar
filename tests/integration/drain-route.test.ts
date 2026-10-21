// POST /api/jobs/drain (SCHEMA.md): bearer CRON_SECRET, http trigger only, counts only.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { closeDatabase } from "@/lib/adapters/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { enqueueOutbox } from "@/lib/modules/platform/outbox";
import { getHealthReport } from "@/lib/platform/health";
import { freshDb } from "./helpers";

const SECRET = "test-cron-secret-0123456789";
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

const call = async (auth?: string) => {
  const { POST } = await import("@/app/api/jobs/drain/route");
  const res = await POST(new Request("http://localhost/api/jobs/drain", { method: "POST", headers: auth ? { authorization: auth } : {} }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("POST /api/jobs/drain", () => {
  it("is unavailable without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(await call(`Bearer ${SECRET}`)).toEqual({ status: 503, body: { error: "not_configured" } });
  });

  it("refuses a wrong or missing bearer", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("JOBS_TRIGGER", "http");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret-0123456789")).status).toBe(401);
  });

  it("refuses when the trigger is the worker", async () => {
    vi.stubEnv("JOBS_TRIGGER", "worker");
    expect((await call(`Bearer ${SECRET}`)).body).toEqual({ error: "trigger_not_http" });
  });

  it("drains with the right bearer and returns counts only", async () => {
    vi.stubEnv("JOBS_TRIGGER", "http");
    vi.stubEnv("MONGODB_URI", uri);
    vi.stubEnv("MONGODB_DB", dbName);
    await enqueueOutbox(db, { type: "email.unknown", aggregateId: "r", seq: 1, payload: { secret: "never-returned" } });
    const r = await call(`Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, claimed: 1, done: 0, retried: 1, dead: 0 });
    expect(JSON.stringify(r.body)).not.toContain("never-returned");

    const report = await getHealthReport({ ...process.env, MONGODB_URI: uri, MONGODB_DB: dbName, JOBS_TRIGGER: "http", CRON_SECRET: SECRET, NODE_ENV: "development" });
    expect(report.database).toBe("connected");
    expect(report.ports[0]).toMatchObject({ id: "database", state: "healthy" });
    expect(report.jobs.outbox?.pending).toBe(1);
    expect(report.jobs.outbox?.lastSuccessAt).toBeInstanceOf(Date);
    expect(JSON.stringify(report)).not.toContain(uri);
  });
});
