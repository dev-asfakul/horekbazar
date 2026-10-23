import { describe, expect, it } from "vitest";
import { getHealthReport, jobsState } from "@/lib/platform/health";
import type { OutboxHealth } from "@/lib/modules/platform/outbox";

const now = new Date("2026-10-21T12:00:00Z");
const outbox = (o: Partial<OutboxHealth>): OutboxHealth => ({ pending: 0, processing: 0, dead: 0, oldestPendingAgeMs: null, lastRunAt: null, lastSuccessAt: null, lastResult: null, accepted: 0, skippedLocked: 0, skippedInterval: 0, lastSkippedAt: null, ...o });

describe("jobs health (domain-rules §13 monitoring)", () => {
  it("is not configured without JOBS_TRIGGER", () => {
    expect(jobsState(null, {}, null, now).reason).toBe("jobs_trigger_not_set");
  });
  it("needs CRON_SECRET for the http triggers", () => {
    expect(jobsState("http", {}, null, now).state).toBe("failing");
    expect(jobsState("vercel-cron", {}, null, now).reason).toBe("jobs_cron_secret_missing");
    expect(jobsState("worker", {}, null, now).state).toBe("configured");
    expect(jobsState("http", { CRON_SECRET: "x".repeat(31) }, null, now).reason).toBe("jobs_cron_secret_missing");
    expect(jobsState("http", { CRON_SECRET: "x".repeat(32) }, null, now).state).toBe("configured");
  });
  it("fails when rows wait and the last successful drain is older than 5 minutes", () => {
    expect(jobsState("worker", {}, outbox({ pending: 2 }), now).reason).toBe("jobs_never_drained");
    const stale = outbox({ pending: 2, lastSuccessAt: new Date(now.getTime() - 6 * 60_000) });
    expect(jobsState("worker", {}, stale, now).reason).toBe("jobs_drain_stale");
    const fresh = outbox({ pending: 2, lastSuccessAt: new Date(now.getTime() - 60_000) });
    expect(jobsState("worker", {}, fresh, now).state).toBe("healthy");
  });
  it("is degraded with dead letters", () => {
    expect(jobsState("worker", {}, outbox({ dead: 1, lastSuccessAt: now }), now).reason).toBe("jobs_dead_letters");
  });
});

describe("integration health registry", () => {
  it("reports names and states only, with no configuration at all", async () => {
    const report = await getHealthReport({ NODE_ENV: "production" }, now);
    expect(report.database).toBe("not_configured");
    const byId = Object.fromEntries(report.ports.map((p) => [p.id, p]));
    expect(byId.database?.state).toBe("not_configured");
    expect(byId.cache?.state).toBe("failing");
    expect(byId.email?.state).toBe("not_configured");
    expect(report.jobs.state).toBe("not_configured");
  });

  it("never includes a configured value", async () => {
    const env = { NODE_ENV: "development", RESEND_API_KEY: "re_canary_value_123456789012345", EMAIL_FROM: "shop@example.invalid", GEMINI_API_KEY: "canary-gemini" };
    const report = await getHealthReport(env, now);
    const text = JSON.stringify(report);
    for (const value of Object.values(env).slice(1)) expect(text).not.toContain(value);
    expect(report.ports.find((p) => p.id === "email")?.state).toBe("configured");
    expect(report.ports.find((p) => p.id === "cache")?.state).toBe("degraded");
  });

  it("marks a partly configured integration as failing", async () => {
    const report = await getHealthReport({ NODE_ENV: "development", STEADFAST_API_KEY: "x" }, now);
    expect(report.ports.find((p) => p.id === "courierSteadfast")).toMatchObject({ state: "failing", reason: "incomplete" });
  });
});
