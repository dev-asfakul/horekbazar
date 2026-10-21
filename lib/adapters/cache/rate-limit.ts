// Cache / rate-limit port (DESIGN.md §1: Upstash Redis over HTTP behind a port, so a buyer can swap
// to self-hosted Redis without touching features). Features call `rateLimiter()` only.
//
// - Upstash configured: sliding-window limits shared by every instance.
// - Development without Upstash: an in-process fixed window (per process, so not shared), and
//   integration health says so.
// - Production without Upstash: limited operations fail closed (`RateLimitUnavailableError`) and
//   integration health is failing. Browsing is unaffected (DESIGN.md §1 conflict 1: an integration is
//   required only by the operations that use it).
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface LimitResult {
  success: boolean;
  remaining: number;
  /** Unix ms when the window resets. */
  reset: number;
}

export interface RateLimiter {
  readonly backend: "upstash" | "memory";
  limit(key: string): Promise<LimitResult>;
}

export interface LimitRule {
  /** Short, stable name, e.g. "login" (keys are `hb:rl:<name>:<key>`). */
  name: string;
  limit: number;
  windowSeconds: number;
}

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("rate-limit store not configured");
    this.name = "RateLimitUnavailableError";
  }
}

type Env = Record<string, string | undefined>;

export function upstashConfig(env: Env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token && /^https:\/\//.test(url) ? { url, token } : null;
}

export class MemoryRateLimiter implements RateLimiter {
  readonly backend = "memory" as const;
  private readonly windows = new Map<string, { count: number; reset: number }>();
  constructor(
    private readonly rule: LimitRule,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<LimitResult> {
    const now = this.now();
    const id = `${this.rule.name}:${key}`;
    let w = this.windows.get(id);
    if (!w || w.reset <= now) {
      w = { count: 0, reset: now + this.rule.windowSeconds * 1000 };
      this.windows.set(id, w);
    }
    w.count++;
    if (this.windows.size > 10_000) for (const [k, v] of this.windows) if (v.reset <= now) this.windows.delete(k);
    return { success: w.count <= this.rule.limit, remaining: Math.max(0, this.rule.limit - w.count), reset: w.reset };
  }
}

class UpstashRateLimiter implements RateLimiter {
  readonly backend = "upstash" as const;
  private readonly impl: Ratelimit;
  constructor(redis: Redis, rule: LimitRule) {
    this.impl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSeconds} s`),
      prefix: `hb:rl:${rule.name}`,
      analytics: false, // command-frugal on the free tier (DESIGN.md §1 free-tier table)
    });
  }
  async limit(key: string): Promise<LimitResult> {
    const r = await this.impl.limit(key);
    return { success: r.success, remaining: r.remaining, reset: r.reset };
  }
}

const memoryLimiters = new Map<string, MemoryRateLimiter>();

/** The limiter for one rule. Throws RateLimitUnavailableError in production without Upstash (fail closed). */
export function rateLimiter(rule: LimitRule, env: Env = process.env): RateLimiter {
  const config = upstashConfig(env);
  if (config) return new UpstashRateLimiter(new Redis({ url: config.url, token: config.token }), rule);
  if (env.NODE_ENV === "production") throw new RateLimitUnavailableError();
  const id = `${rule.name}:${rule.limit}:${rule.windowSeconds}`;
  let limiter = memoryLimiters.get(id);
  if (!limiter) memoryLimiters.set(id, (limiter = new MemoryRateLimiter(rule)));
  return limiter;
}

export type CacheState = "connected" | "not_configured" | "unreachable" | "memory_fallback";

/** Health: one PING over REST. Never returns the URL or token. */
export async function checkCache(env: Env = process.env): Promise<CacheState> {
  const config = upstashConfig(env);
  if (!config) return env.NODE_ENV === "production" ? "not_configured" : "memory_fallback";
  try {
    const pong = await new Redis({ url: config.url, token: config.token, retry: false }).ping();
    return pong === "PONG" ? "connected" : "unreachable";
  } catch {
    return "unreachable";
  }
}
