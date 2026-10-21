// POST /api/jobs/drain (JOBS_TRIGGER=http, domain-rules §13): an external scheduler (Upstash QStash
// schedule, GitHub Actions schedule, another cron service, or Vercel Cron on Pro) calls this with
// `Authorization: Bearer <CRON_SECRET>`. Each call drains due outbox rows for a bounded time and
// returns counts only. No in-process timer exists in the web server.
import { randomUUID } from "node:crypto";
import { DatabaseNotReadyError, getDatabase } from "@/lib/adapters/db/client";
import { isAuthorizedBearer } from "@/lib/adapters/jobs/auth";
import { outboxHandlers } from "@/lib/adapters/jobs/handlers";
import { drainOutbox } from "@/lib/modules/platform/outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DRAIN_BUDGET_MS = 20_000;
const noStore = { "Cache-Control": "no-store" };

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: noStore });

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return reply(503, { error: "not_configured" });
  if (!isAuthorizedBearer(request.headers.get("authorization"), secret)) return reply(401, { error: "unauthorized" });
  const trigger = process.env.JOBS_TRIGGER?.trim();
  if (trigger !== "http" && trigger !== "vercel-cron") return reply(409, { error: "trigger_not_http" });

  try {
    const db = await getDatabase();
    const result = await drainOutbox(db, outboxHandlers, { workerId: `http-${randomUUID()}`, trigger: "http", budgetMs: DRAIN_BUDGET_MS });
    return reply(result.ok ? 200 : 500, { ok: result.ok, claimed: result.claimed, done: result.done, retried: result.retried, dead: result.dead, durationMs: result.durationMs });
  } catch (error) {
    if (error instanceof DatabaseNotReadyError) return reply(503, { error: `database_${error.state}` });
    return reply(500, { error: "drain_failed" });
  }
}

export function GET() {
  return reply(405, { error: "method_not_allowed" });
}
