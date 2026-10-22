// Next.js 16 proxy (formerly middleware; BUILD-PLAN C2): locale routing, security headers, and (B3) a
// cookie-presence sign-in redirect for private pages. The redirect is not authorisation; pages and
// server actions validate the session and capabilities themselves.
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, routeLocale } from "@/lib/i18n/locales";
import { SECURE_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/modules/identity/cookies";
import { ADMIN_PATH_HEADER as PATH_HEADER, signInRedirect } from "@/lib/modules/identity/paths";
import { isMaintenanceMode, MAINTENANCE_RETRY_AFTER_SECONDS, maintenanceHtml } from "@/lib/maintenance";
import { baseSecurityHeaders, buildCsp, createNonce } from "@/lib/security/headers";

// Next.js runs the proxy again on an internally rewritten path. This per-process token marks
// our own "/" -> "/bn" rewrite so the second pass does not apply the "/bn" canonical redirect.
// Clients cannot guess it, so a client-sent "/bn/..." URL is still redirected.
const INTERNAL_REWRITE_HEADER = "x-hb-internal-rewrite";
const INTERNAL_REWRITE_TOKEN = createNonce();

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const { pathname, search } = request.nextUrl;
  const internal = request.headers.get(INTERNAL_REWRITE_HEADER) === INTERNAL_REWRITE_TOKEN;
  const route = internal ? ({ kind: "next" } as const) : routeLocale(pathname);

  const nonce = createNonce();
  const csp = buildCsp(nonce, { pathname, isDev });

  let response: NextResponse;
  const hasSession = request.cookies.has(SESSION_COOKIE) || request.cookies.has(SECURE_SESSION_COOKIE);
  const signIn = internal || route.kind === "redirect" ? null : signInRedirect(pathname, search, hasSession);
  const maintenance = !internal && route.kind !== "bypass" && route.kind !== "redirect" && isMaintenanceMode(process.env);
  if (maintenance) {
    // Every storefront page answers 503 with Retry-After, not cached and not indexed. The proxy writes the
    // page itself because a rewrite cannot carry the 503 status (lib/maintenance.ts).
    const locale = "locale" in route ? route.locale : defaultLocale;
    response = new NextResponse(maintenanceHtml(locale, nonce), {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": String(MAINTENANCE_RETRY_AFTER_SECONDS),
        "Cache-Control": "no-store",
      },
    });
  } else if (signIn) {
    response = NextResponse.redirect(new URL(signIn, request.url), 307);
    response.headers.set("Cache-Control", "no-store");
  } else if (route.kind === "redirect") {
    // "/bn/..." is not canonical: the default locale lives at "/".
    response = NextResponse.redirect(new URL(`${route.pathname}${search}`, request.url), 308);
  } else {
    // Next.js reads the nonce from the request's CSP header and applies it to its own scripts.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete(INTERNAL_REWRITE_HEADER);
    if (route.kind === "rewrite") requestHeaders.set(INTERNAL_REWRITE_HEADER, INTERNAL_REWRITE_TOKEN);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set(PATH_HEADER, pathname); // always overwritten: lets the admin 403 page name the capability
    requestHeaders.set("Content-Security-Policy", csp);
    response =
      route.kind === "rewrite"
        ? NextResponse.rewrite(new URL(`${route.pathname}${search}`, request.url), { request: { headers: requestHeaders } })
        : NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(baseSecurityHeaders({ isDev }))) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: [
    // Prefetch requests must pass too: without the "/" -> "/bn" rewrite a prefetch of a storefront
    // link 404s, and the router briefly shows Next's built-in error page on navigation.
    "/((?!_next/static|_next/image|fonts/|favicon.ico|robots.txt|sitemap.xml|sw.js).*)",
  ],
};
