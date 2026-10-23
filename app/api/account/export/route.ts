// GET /api/account/export?t=<token> (B10 part b): the signed-in customer's own data as a JSON file.
// The token comes from /account/privacy after a fresh password check; it is random, belongs to one
// customer, works once and expires after 10 minutes (identity/privacy.ts claimExport, atomic). A
// signed-out request, another customer's token, a used or expired token all get the same answer (a
// redirect back to /account/privacy?export=invalid), so the route is not an oracle. Never cached.
import { getIdentity, getPrincipal } from "@/lib/auth/server";
import { localeHref } from "@/lib/i18n/href";
import { clientIp } from "@/lib/modules/identity/limits";
import { buildExport, claimExport } from "@/lib/modules/identity/privacy";

export const dynamic = "force-dynamic";

const headersBase = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  const locale = url.searchParams.get("l") === "en" ? "en" : "bn";
  const notFound = () => new Response(null, { status: 303, headers: { ...headersBase, Location: `${localeHref(locale, "/account/privacy")}?export=invalid` } });
  const identity = await getIdentity();
  if (!identity.ok) return Response.json({ error: "unavailable" }, { status: 503, headers: headersBase });
  const principal = await getPrincipal();
  if (!principal) return notFound();
  const db = identity.identity.db;
  if (!(await claimExport(db, principal.user.id, token, { ip: clientIp(request.headers) }))) return notFound();
  const now = new Date();
  const data = await buildExport(db, principal.user.id, now);
  if (!data) return notFound();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: { ...headersBase, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="horekbazar-account-${day}.json"` },
  });
}
