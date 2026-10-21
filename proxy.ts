// Next.js 16 proxy (formerly middleware; BUILD-PLAN C2). B0 skeleton: locale routing and
// security headers only. Auth gating, redirects and rate limiting arrive with their phases.
import { NextResponse, type NextRequest } from "next/server";
import { routeLocale } from "@/lib/i18n/locales";
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
  if (route.kind === "redirect") {
    // "/bn/..." is not canonical: the default locale lives at "/".
    response = NextResponse.redirect(new URL(`${route.pathname}${search}`, request.url), 308);
  } else {
    // Next.js reads the nonce from the request's CSP header and applies it to its own scripts.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete(INTERNAL_REWRITE_HEADER);
    if (route.kind === "rewrite") requestHeaders.set(INTERNAL_REWRITE_HEADER, INTERNAL_REWRITE_TOKEN);
    requestHeaders.set("x-nonce", nonce);
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
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
