// CSP and security-header regression tests (D17 approved, option (a): nonce CSP on every page).
import { describe, expect, it } from "vitest";
import { baseSecurityHeaders, buildCsp, createNonce, isPrivatePath } from "@/lib/security/headers";

describe("createNonce", () => {
  it("returns a fresh base64 value of 128 bits each time", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });
});

describe("buildCsp (production)", () => {
  const csp = buildCsp("abc123", { pathname: "/", isDev: false });
  it("uses the nonce with strict-dynamic and no unsafe-inline or unsafe-eval for scripts", () => {
    const script = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });
  it("blocks plugins and base-tag hijacking", () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
  it("allows framing by the same origin on the storefront only", () => {
    expect(csp).toContain("frame-ancestors 'self'");
    for (const p of ["/checkout", "/en/account/orders", "/admin", "/login"]) {
      expect(buildCsp("n", { pathname: p, isDev: false })).toContain("frame-ancestors 'none'");
    }
  });
});

describe("isPrivatePath", () => {
  it("matches whole segments, in both locales", () => {
    expect(isPrivatePath("/account")).toBe(true);
    expect(isPrivatePath("/en/checkout/success/123")).toBe(true);
    expect(isPrivatePath("/accounting-books")).toBe(false);
    expect(isPrivatePath("/p/admin-desk")).toBe(false);
  });
});

describe("baseSecurityHeaders", () => {
  it("sends nosniff and a referrer policy, and HSTS only outside development", () => {
    expect(baseSecurityHeaders({ isDev: false })["X-Content-Type-Options"]).toBe("nosniff");
    expect(baseSecurityHeaders({ isDev: false })["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(baseSecurityHeaders({ isDev: false })["Strict-Transport-Security"]).toBeDefined();
    expect(baseSecurityHeaders({ isDev: true })["Strict-Transport-Security"]).toBeUndefined();
  });
});
