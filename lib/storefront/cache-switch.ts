// Tier: build. Phase A (docs/CACHE-INVENTORY.md §4): the browser suite's disposable server
// (scripts/e2e-db-server.mjs) seeds its database from the test process, a writer that cannot clear
// the Next.js cache. That server may read public data live only when it says so explicitly AND its
// database is on the loopback interface, which no deployment can be (same rule as
// RATE_LIMIT_LOCAL_TEST in lib/adapters/cache/rate-limit.ts). Everywhere else the cache is on.
type Env = Record<string, string | undefined>;

export const publicCacheLocalTestOff = (env: Env) => env.PUBLIC_CACHE_LOCAL_TEST_OFF === "1" && /^mongodb:\/\/127\.0\.0\.1:\d+\//.test(env.MONGODB_URI ?? "") && !env.VERCEL;

/** Whether this process reads public data live (test server only). Not part of any cache key. */
export const publicCacheOff = () => publicCacheLocalTestOff(process.env);
