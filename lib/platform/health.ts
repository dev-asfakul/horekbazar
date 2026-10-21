// Integration health registry (BUILD-PLAN B2; DESIGN.md → /admin/health). One entry per port, with
// a state and a reason code that the admin page translates. Names and states only: never a value,
// a host name or a provider error message. Only the database and cache are checked live in B2; the
// other ports report their configuration until their phase adds a real check.
import { checkDatabase, databaseConfig, getClient, type DatabaseState } from "@/lib/adapters/db/client";
import { checkCache, type CacheState } from "@/lib/adapters/cache/rate-limit";
import { integrationVariables, parseServerEnv, type Integration } from "@/lib/env";
import { outboxHealth, type OutboxHealth } from "@/lib/modules/platform/outbox";

export type PortState = "healthy" | "configured" | "degraded" | "not_configured" | "failing";

export interface PortHealth {
  id: string;
  state: PortState;
  /** Message key under admin.health.reasons. */
  reason: string;
  /** Variable names this port reads (names only). */
  variables: readonly string[];
  /** True when the app cannot run its core flows without this port. */
  required: boolean;
  /** Phase that adds the live check, when the port is not checked yet. */
  checkedFrom?: string;
}

export interface JobsHealth {
  trigger: "worker" | "http" | "vercel-cron" | null;
  state: PortState;
  reason: string;
  outbox: OutboxHealth | null;
  staleAfterMs: number;
}

export interface HealthReport {
  checkedAt: Date;
  database: DatabaseState;
  ports: PortHealth[];
  jobs: JobsHealth;
}

type Env = Record<string, string | undefined>;

const OPTIONAL_PORTS: { id: string; integration: Integration; phase: string }[] = [
  { id: "googleSignIn", integration: "googleSignIn", phase: "B3" },
  { id: "media", integration: "cloudinary", phase: "B4" },
  { id: "email", integration: "email", phase: "B3" },
  { id: "push", integration: "push", phase: "B9" },
  { id: "ai", integration: "gemini", phase: "B4" },
  { id: "courierSteadfast", integration: "steadfast", phase: "B8" },
  { id: "courierPathao", integration: "pathao", phase: "B8" },
  { id: "realtime", integration: "realtime", phase: "B9" },
];

const databasePort = (state: DatabaseState): PortHealth => ({
  id: "database",
  state: state === "connected" ? "healthy" : state === "not_configured" ? "not_configured" : "failing",
  reason: `database_${state}`,
  variables: ["MONGODB_URI", "MONGODB_DB"],
  required: true,
});

const cachePort = (state: CacheState): PortHealth => ({
  id: "cache",
  state: state === "connected" ? "healthy" : state === "memory_fallback" ? "degraded" : "failing",
  reason: `cache_${state}`,
  variables: integrationVariables.redis,
  required: true,
});

/** Default 5 minutes in production (domain-rules §13 monitoring). */
export const DRAIN_STALE_AFTER_MS = 5 * 60_000;

export function jobsState(trigger: JobsHealth["trigger"], env: Env, outbox: OutboxHealth | null, now: Date): Pick<JobsHealth, "state" | "reason"> {
  if (!trigger) return { state: "not_configured", reason: "jobs_trigger_not_set" };
  // vercel-cron is http called by Vercel Cron; Hobby runs once a day, which the staleness check catches.
  if (trigger !== "worker" && !env.CRON_SECRET) return { state: "failing", reason: "jobs_cron_secret_missing" };
  if (!outbox) return { state: "configured", reason: "jobs_database_unavailable" };
  const last = outbox.lastSuccessAt?.getTime() ?? null;
  const stale = last === null || now.getTime() - last > DRAIN_STALE_AFTER_MS;
  if (stale && outbox.pending > 0) return { state: "failing", reason: last === null ? "jobs_never_drained" : "jobs_drain_stale" };
  if (outbox.dead > 0) return { state: "degraded", reason: "jobs_dead_letters" };
  if (last === null) return { state: "configured", reason: "jobs_no_drain_yet" };
  return { state: "healthy", reason: "jobs_ok" };
}

export async function getHealthReport(env: Env = process.env, now: Date = new Date()): Promise<HealthReport> {
  const report = parseServerEnv(env);
  const config = databaseConfig(env);
  const [database, cache] = await Promise.all([checkDatabase(config, { fresh: true }), checkCache(env)]);

  let outbox: OutboxHealth | null = null;
  if (database === "connected" && config) {
    try {
      outbox = await outboxHealth(getClient(config).db(config.dbName), now);
    } catch {
      outbox = null;
    }
  }

  const ports: PortHealth[] = [databasePort(database), cachePort(cache)];
  for (const { id, integration, phase } of OPTIONAL_PORTS) {
    const state = report.integrations[integration];
    ports.push({
      id,
      state: state === "configured" ? "configured" : state === "incomplete" ? "failing" : "not_configured",
      reason: state === "incomplete" ? "incomplete" : state === "configured" ? "configured_not_checked" : "optional_not_configured",
      variables: integrationVariables[integration],
      required: false,
      checkedFrom: phase,
    });
  }

  const trigger = report.env.JOBS_TRIGGER ?? null;
  return { checkedAt: now, database, ports, jobs: { trigger, ...jobsState(trigger, env, outbox, now), outbox, staleAfterMs: DRAIN_STALE_AFTER_MS } };
}
