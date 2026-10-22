// Rate limits for every identity entry point (domain-rules §9: login, registration, password reset).
// Backed by the rate-limit port: Upstash in production, failing closed when it is missing or down.
import { rateLimiter, RateLimitUnavailableError, type LimitRule } from "../../adapters/cache/rate-limit.ts";

export const LIMITS = {
  signInIp: { name: "signin-ip", limit: 30, windowSeconds: 600 },
  signInEmail: { name: "signin-email", limit: 8, windowSeconds: 600 },
  signUpIp: { name: "signup-ip", limit: 5, windowSeconds: 3600 },
  resetIp: { name: "reset-ip", limit: 10, windowSeconds: 3600 },
  resetEmail: { name: "reset-email", limit: 3, windowSeconds: 3600 },
  verifyResendEmail: { name: "verify-resend", limit: 3, windowSeconds: 3600 },
  twoFactorIp: { name: "2fa-ip", limit: 15, windowSeconds: 600 },
  setupIp: { name: "setup-ip", limit: 5, windowSeconds: 3600 },
  oauthIp: { name: "oauth-ip", limit: 30, windowSeconds: 600 },
  accountChange: { name: "account-change", limit: 20, windowSeconds: 600 },
  cartIp: { name: "cart-ip", limit: 120, windowSeconds: 600 },
  // Coupon guessing: a few tries per device and address.
  couponIp: { name: "coupon-ip", limit: 20, windowSeconds: 600 },
} satisfies Record<string, LimitRule>;

export type LimitOutcome = "ok" | "limited" | "unavailable";

/** Checks every rule; "limited" if any is exceeded, "unavailable" if the store is missing or failing. */
export async function checkLimits(checks: { rule: LimitRule; key: string }[], env: Record<string, string | undefined> = process.env): Promise<LimitOutcome> {
  try {
    for (const { rule, key } of checks) {
      const result = await rateLimiter(rule, env).limit(key.toLowerCase().slice(0, 200));
      if (!result.success) return "limited";
    }
    return "ok";
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return "unavailable";
    return "unavailable";
  }
}

/** The client IP from the proxy headers (first x-forwarded-for hop on Vercel), or "unknown". */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
