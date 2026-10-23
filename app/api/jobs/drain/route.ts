// POST /api/jobs/drain (JOBS_TRIGGER=http, domain-rules §13): an external scheduler (cron-job.org,
// owner decision 2026-10-23; docs/JOBS.md) calls this with `Authorization: Bearer <CRON_SECRET>`.
// Each accepted call drains due outbox rows for a bounded time and returns counts only. No in-process
// timer exists in the web server.
// C-01: one drain at a time and at most one accepted per 30 s (acquireDrainSlot), so retries,
// overlaps and replayed requests are answered 200 { skipped } without processing anything. The secret
// is only ever read from the Authorization header; a query string is refused so it is never put there.
import { randomUUID } from "node:crypto";
import { DatabaseNotReadyError, getDatabase } from "@/lib/adapters/db/client";
import { isAuthorizedBearer } from "@/lib/adapters/jobs/auth";
import { outboxHandlers } from "@/lib/adapters/jobs/handlers";
import { acquireDrainSlot, drainOutbox, releaseDrainSlot } from "@/lib/modules/platform/outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DRAIN_BUDGET_MS = 20_000;
/** High entropy: e.g. `openssl rand -base64 32` (44 characters). Shorter values leave the endpoint closed. */
const MIN_SECRET_LENGTH = 32;
const noStore = { "Cache-Control": "no-store" };

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: noStore });

export async function POST(request: Request) {
  if (new URL(request.url).search) return reply(400, { error: "unexpected_query" });
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) return reply(503, { error: "not_configured" });
  if (!isAuthorizedBearer(request.headers.get("authorization"), secret)) return reply(401, { error: "unauthorized" });
  const trigger = process.env.JOBS_TRIGGER?.trim();
  if (trigger !== "http" && trigger !== "vercel-cron") return reply(409, { error: "trigger_not_http" });

  try {
    const db = await getDatabase();
    const workerId = `http-${randomUUID()}`;
    const slot = await acquireDrainSlot(db, { owner: workerId });
    if (!slot.acquired) return reply(200, { ok: true, skipped: slot.reason });
    try {
      const result = await drainOutbox(db, outboxHandlers, { workerId, trigger: "http", budgetMs: DRAIN_BUDGET_MS });
      return reply(result.ok ? 200 : 500, { ok: result.ok, claimed: result.claimed, done: result.done, retried: result.retried, dead: result.dead, durationMs: result.durationMs });
    } finally {
      await releaseDrainSlot(db, workerId);
    }
  } catch (error) {
    if (error instanceof DatabaseNotReadyError) return reply(503, { error: `database_${error.state}` });
    return reply(500, { error: "drain_failed" });
  }
}

export function GET() {
  return reply(405, { error: "method_not_allowed" });
}
