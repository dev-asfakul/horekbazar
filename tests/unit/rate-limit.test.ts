import { describe, expect, it } from "vitest";
import { checkCache, MemoryRateLimiter, rateLimiter, RateLimitUnavailableError, upstashConfig } from "@/lib/adapters/cache/rate-limit";

const rule = { name: "login", limit: 3, windowSeconds: 60 };

describe("rate-limit port", () => {
  it("memory limiter allows `limit` requests per window and resets after it", async () => {
    let now = 1_000_000;
    const limiter = new MemoryRateLimiter(rule, () => now);
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await limiter.limit("ip:1")).success);
    expect(results).toEqual([true, true, true, false]);
    expect((await limiter.limit("ip:2")).success).toBe(true);
    now += 60_001;
    expect((await limiter.limit("ip:1")).success).toBe(true);
  });

  it("allows the in-process limiter in production only for the loopback test server", () => {
    const local = { NODE_ENV: "production", RATE_LIMIT_LOCAL_TEST: "1", MONGODB_URI: "mongodb://127.0.0.1:41234/?replicaSet=testset" };
    expect(rateLimiter(rule, local).backend).toBe("memory");
    expect(() => rateLimiter(rule, { ...local, RATE_LIMIT_LOCAL_TEST: undefined })).toThrow(RateLimitUnavailableError);
    expect(() => rateLimiter(rule, { ...local, MONGODB_URI: "mongodb+srv://user:pass@cluster.example.net/db" })).toThrow(RateLimitUnavailableError);
    expect(() => rateLimiter(rule, { ...local, MONGODB_URI: "mongodb://127.0.0.1.evil.example:27017/db" })).toThrow(RateLimitUnavailableError);
    expect(() => rateLimiter(rule, { ...local, VERCEL: "1" })).toThrow(RateLimitUnavailableError);
  });

  it("fails closed in production without Upstash, and uses memory in development", () => {
    expect(() => rateLimiter(rule, { NODE_ENV: "production" })).toThrow(RateLimitUnavailableError);
    expect(rateLimiter(rule, { NODE_ENV: "development" }).backend).toBe("memory");
  });

  it("needs both the https REST URL and the token", () => {
    expect(upstashConfig({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" })).toBeNull();
    expect(upstashConfig({ UPSTASH_REDIS_REST_URL: "http://x", UPSTASH_REDIS_REST_TOKEN: "t" })).toBeNull();
    expect(upstashConfig({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" })).not.toBeNull();
  });

  it("health reports the fallback without a network call", async () => {
    expect(await checkCache({ NODE_ENV: "development" })).toBe("memory_fallback");
    expect(await checkCache({ NODE_ENV: "production" })).toBe("not_configured");
  });
});
