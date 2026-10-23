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
  // checkout.place: 5 per minute per customer (SCHEMA.md API surface), and per address.
  checkoutUser: { name: "checkout-user", limit: 5, windowSeconds: 60 },
  checkoutIp: { name: "checkout-ip", limit: 20, windowSeconds: 60 },
  // Coupon guessing: a few tries per device and address.
  couponIp: { name: "coupon-ip", limit: 20, windowSeconds: 600 },
  // returns.request: 5 per hour per customer (SCHEMA.md API surface).
  returnRequest: { name: "return-request", limit: 5, windowSeconds: 3600 },
  // B9: reviews 5 per hour, messages 30 per 10 minutes, per customer.
  reviewSubmit: { name: "review-submit", limit: 5, windowSeconds: 3600 },
  messagePost: { name: "message-post", limit: 20, windowSeconds: 3600 },
  // B9 part 2: turning browser notifications on/off or changing their topics.
  pushChange: { name: "push-change", limit: 30, windowSeconds: 600 },
  /** B9 part 2b: Gemini drafts per staff member (domain-rules §7 "rate-limited per staff user"). */
  aiDraft: { name: "ai-draft", limit: 20, windowSeconds: 3600 },
  /** B10: privacy export/deletion requests per customer, wrong passwords included (password guessing). */
  privacyRequest: { name: "privacy-request", limit: 5, windowSeconds: 3600 },
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
