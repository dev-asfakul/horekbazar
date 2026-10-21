// Better Auth HTTP endpoint, deliberately narrow. Every sign-in, sign-up, reset and 2FA operation
// runs through HorekBazar server actions (lib/actions/identity.ts), where the rate-limit port applies
// and inputs are validated. The only HTTP surface Better Auth needs is the OAuth callback (Google),
// which is itself rate limited. Anything else answers 404, so no unthrottled auth API is exposed.
import { getIdentity } from "@/lib/auth/server";
import { checkLimits, clientIp, LIMITS } from "@/lib/modules/identity/limits";

const ALLOWED_GET = /^\/api\/auth\/callback\/google$/;

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

export async function GET(request: Request) {
  const { pathname } = new URL(request.url);
  if (!ALLOWED_GET.test(pathname)) return notFound();
  const limited = await checkLimits([{ rule: LIMITS.oauthIp, key: clientIp(request.headers) }]);
  if (limited !== "ok") return new Response("Too many requests", { status: limited === "limited" ? 429 : 503, headers: { "Cache-Control": "no-store", "Retry-After": "600" } });
  const result = await getIdentity();
  if (!result.ok || !result.identity.googleEnabled) return notFound();
  return result.identity.auth.handler(request);
}

export async function POST() {
  return notFound();
}
