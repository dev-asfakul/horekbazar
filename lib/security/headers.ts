// Security headers and the Content-Security-Policy (docs/domain-rules.md §9, docs/BUILD-PLAN.md §9.1).
// D17 approved, option (a): a fresh nonce per request on every rendered page, including the public
// storefront, so storefront HTML is rendered per request. Nothing here weakens a policy to gain caching.

const CLOUDINARY_IMAGES = "https://res.cloudinary.com";

/** Route classes that carry personal or session data never allow framing (BUILD-PLAN §9.1 table). */
const PRIVATE_PREFIXES = ["/checkout", "/account", "/admin", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

/** Removes the "/en" prefix so route classes match in both locales. */
function stripLocale(pathname: string): string {
  return pathname === "/en" ? "/" : pathname.startsWith("/en/") ? pathname.slice(3) : pathname;
}

export function isPrivatePath(pathname: string): boolean {
  const path = stripLocale(pathname);
  return PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** 128 random bits, base64. Uses Web Crypto so it runs in the proxy runtime. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildCsp(nonce: string, options: { pathname: string; isDev: boolean }): string {
  const { pathname, isDev } = options;
  const directives: string[] = [
    "default-src 'self'",
    // Next.js needs 'unsafe-eval' only in development (React debugging).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Development injects inline styles for fast refresh; production uses the nonce.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `img-src 'self' blob: data: ${CLOUDINARY_IMAGES}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${isPrivatePath(pathname) ? "'none'" : "'self'"}`,
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Headers sent on every response, in addition to the CSP. */
export function baseSecurityHeaders(options: { isDev: boolean }): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
  // HSTS only outside development; preload is a separate owner decision and is not requested.
  if (!options.isDev) headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
  return headers;
}
