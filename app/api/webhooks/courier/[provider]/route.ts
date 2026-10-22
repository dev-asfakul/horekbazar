// POST /api/webhooks/courier/[provider] (B8; SCHEMA.md API surface "courier webhooks"). Only
// Steadfast is accepted in this build. Requires the courier to be configured on this deployment and
// `Authorization: Bearer <COURIER_WEBHOOK_SECRET>` (set the same token in the Steadfast portal's
// webhook settings). The body is only a signal: the status applied is read from Steadfast's API
// (lib/modules/fulfilment/webhooks.ts). Responses carry counts/outcomes only, never shipment data.
import { DatabaseNotReadyError, getDatabase } from "@/lib/adapters/db/client";
import { courierState } from "@/lib/adapters/courier/index";
import { isAuthorizedBearer } from "@/lib/adapters/jobs/auth";
import { MAX_WEBHOOK_BYTES, parseSteadfastEvent, receiveCourierEvent } from "@/lib/modules/fulfilment/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: noStore });

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "steadfast") return reply(404, { error: "unknown_courier" });
  const secret = process.env.COURIER_WEBHOOK_SECRET?.trim();
  const courier = courierState("steadfast");
  if (!secret || secret.length < 16 || courier.state !== "available") return reply(503, { error: "not_configured" });
  if (!isAuthorizedBearer(request.headers.get("authorization"), secret)) return reply(401, { error: "unauthorized" });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return reply(413, { error: "too_large" });
  const text = await request.text();
  if (text.length > MAX_WEBHOOK_BYTES) return reply(413, { error: "too_large" });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  const event = parseSteadfastEvent(body);
  if (!event) return reply(400, { error: "invalid_event" });
  try {
    const db = await getDatabase();
    const result = await receiveCourierEvent(db, "steadfast", event);
    return reply(200, { status: "success", outcome: result.outcome });
  } catch (error) {
    if (error instanceof DatabaseNotReadyError) return reply(503, { error: `database_${error.state}` });
    return reply(500, { error: "webhook_failed" });
  }
}

export function GET() {
  return reply(405, { error: "method_not_allowed" });
}
