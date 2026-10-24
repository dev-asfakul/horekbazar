// Tier: build. Phase F part 2 (D31): the store's default language for the proxy.
// Read from the settings singleton (`locale.default`) with a short in-process memo, because the proxy
// asks only on entry navigations without a language cookie. Any failure (no database, timeout, bad
// value) answers the built-in default (Bengali) and is retried after a short back-off; it never
// blocks or breaks a page. An admin save clears the memo in that process; other server instances
// pick the change up within STORE_LOCALE_TTL_MS. Read with the native driver projection only: no
// request input reaches the query.
import type { Locale } from "@/lib/i18n/locales";
import { defaultLocale } from "@/lib/i18n/locales";
import { storeDefaultLocale } from "@/lib/i18n/entry-locale";
import { publicCacheLocalTestOff } from "@/lib/storefront/cache-switch";

export const STORE_LOCALE_TTL_MS = 60_000;
const FAILURE_TTL_MS = 10_000;
const LOOKUP_TIMEOUT_MS = 800;

const holder = globalThis as unknown as { __hbStoreLocale?: { value: Locale; until: number; pending?: Promise<Locale> } };

export function forgetStoreDefaultLocale() {
  delete holder.__hbStoreLocale;
}

async function lookup(env: Record<string, string | undefined>): Promise<{ value: Locale; ok: boolean }> {
  const { databaseConfig, getClient } = await import("@/lib/adapters/db/client");
  const config = databaseConfig(env);
  if (!config) return { value: defaultLocale, ok: true };
  const { SETTINGS, SETTINGS_ID } = await import("@/lib/modules/settings/schema");
  const doc = await getClient(config)
    .db(config.dbName)
    .collection<{ _id: string; locale?: { default?: unknown } }>(SETTINGS)
    .findOne({ _id: SETTINGS_ID }, { projection: { "locale.default": 1 }, maxTimeMS: LOOKUP_TIMEOUT_MS });
  return { value: storeDefaultLocale(doc?.locale?.default), ok: true };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

export async function getStoreDefaultLocale(env: Record<string, string | undefined> = process.env, now = Date.now()): Promise<Locale> {
  // The loopback-only browser-suite server reads live (same switch as the public-data cache), because
  // its specs change settings from the test process, which cannot clear this memo.
  const memo = publicCacheLocalTestOff(env) ? undefined : holder.__hbStoreLocale;
  if (memo && memo.until > now) return memo.value;
  if (memo?.pending) return memo.pending;
  const pending = withTimeout(lookup(env), LOOKUP_TIMEOUT_MS)
    .then(({ value }) => {
      holder.__hbStoreLocale = { value, until: Date.now() + STORE_LOCALE_TTL_MS };
      return value;
    })
    .catch(() => {
      holder.__hbStoreLocale = { value: defaultLocale, until: Date.now() + FAILURE_TTL_MS };
      return defaultLocale;
    });
  holder.__hbStoreLocale = { value: memo?.value ?? defaultLocale, until: 0, pending };
  return pending;
}
