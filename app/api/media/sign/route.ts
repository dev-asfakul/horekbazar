// POST /api/media/sign (B4): a short-lived Cloudinary upload signature for staff.
// - Same-origin requests only (Origin must match Host), JSON body { purpose: "product" | "banner" }.
// - Capability on the server: `catalogue.write` for product images, `merch.write` for banners.
// - 503 not_configured when Cloudinary variables are absent: the admin then shows a notice and
//   products fall back to the LabelTile. The API secret is never returned.
import { getPrincipal } from "@/lib/auth/server";
import { cloudinaryConfig, uploadSignature, type MediaPurpose } from "@/lib/adapters/media/cloudinary";
import { decideAccess } from "@/lib/modules/identity/principal";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: noStore });

const CAPABILITY = { product: "catalogue.write", banner: "merch.write" } as const;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply(403, { error: "cross_origin" });
  let purpose: MediaPurpose;
  try {
    const body = (await request.json()) as { purpose?: unknown };
    if (body.purpose !== "product" && body.purpose !== "banner") return reply(400, { error: "invalid_purpose" });
    purpose = body.purpose;
  } catch {
    return reply(400, { error: "invalid_body" });
  }
  const principal = await getPrincipal();
  const decision = decideAccess(principal, CAPABILITY[purpose], { mutation: true });
  if (decision.result === "signed_out") return reply(401, { error: "signed_out" });
  if (decision.result !== "allowed") return reply(403, { error: "forbidden" });
  const config = cloudinaryConfig();
  if (!config) return reply(503, { error: "not_configured" });
  const signed = uploadSignature(config, purpose);
  return reply(200, { uploadUrl: signed.uploadUrl, apiKey: signed.apiKey, params: signed.params, signature: signed.signature });
}

export function GET() {
  return reply(405, { error: "method_not_allowed" });
}
