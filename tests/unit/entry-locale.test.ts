import { afterEach, describe, expect, it } from "vitest";
import { entryRedirect, isEntryNavigation, needsStoreDefault, parseLocale, preferredLocale, storeDefaultLocale, type FetchMetadata } from "@/lib/i18n/entry-locale";
import { forgetStoreDefaultLocale, getStoreDefaultLocale } from "@/lib/i18n/store-default-locale";

const entry: FetchMetadata = { mode: "navigate", dest: "document", site: "none", prefetch: false };
const inside: FetchMetadata = { ...entry, site: "same-origin" };
const crawler: FetchMetadata = { mode: null, dest: null, site: null, prefetch: false };

describe("default language for new visits (D31)", () => {
  it("reads stored values safely", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale(" bn ")).toBe("bn");
    for (const bad of ["EN", "fr", "", "en-US", null, undefined]) expect(parseLocale(bad)).toBeNull();
    expect(storeDefaultLocale("en")).toBe("en");
    for (const bad of ["de", 3, null, undefined, {}]) expect(storeDefaultLocale(bad)).toBe("bn");
  });

  it("treats only top-level navigations from outside the site as entry visits", () => {
    expect(isEntryNavigation(entry)).toBe(true);
    expect(isEntryNavigation({ ...entry, site: "cross-site" })).toBe(true);
    expect(isEntryNavigation(inside)).toBe(false);
    expect(isEntryNavigation({ ...entry, site: "same-site" })).toBe(false);
    expect(isEntryNavigation({ ...entry, dest: "iframe" })).toBe(false);
    expect(isEntryNavigation({ ...entry, mode: "cors" })).toBe(false);
    expect(isEntryNavigation({ ...entry, prefetch: true })).toBe(false);
    expect(isEntryNavigation(crawler)).toBe(false);
  });

  it("an explicit preference wins over the store default", () => {
    expect(preferredLocale("bn", "en")).toBe("bn");
    expect(preferredLocale("en", "bn")).toBe("en");
    expect(preferredLocale(undefined, "en")).toBe("en");
    expect(preferredLocale("garbage", "en")).toBe("en");
  });

  it("redirects an entry visit to English only when English applies, keeping path and query", () => {
    expect(entryRedirect("/", "", undefined, "en", entry)).toBe("/en");
    expect(entryRedirect("/c/kitchen", "?page=2", undefined, "en", entry)).toBe("/en/c/kitchen?page=2");
    expect(entryRedirect("/c/kitchen", "", "en", "bn", entry)).toBe("/en/c/kitchen");
    expect(entryRedirect("/", "", "bn", "en", entry)).toBeNull();
    expect(entryRedirect("/", "", undefined, "bn", entry)).toBeNull();
  });

  it("never redirects links inside the site, prefetches or crawlers", () => {
    for (const meta of [inside, crawler, { ...entry, prefetch: true }]) expect(entryRedirect("/", "", undefined, "en", meta)).toBeNull();
  });

  it("asks for the store default only when it can matter", () => {
    expect(needsStoreDefault(undefined, entry)).toBe(true);
    expect(needsStoreDefault("bad", entry)).toBe(true);
    expect(needsStoreDefault("bn", entry)).toBe(false);
    expect(needsStoreDefault(undefined, inside)).toBe(false);
    expect(needsStoreDefault(undefined, crawler)).toBe(false);
  });
});

describe("store default lookup", () => {
  afterEach(() => forgetStoreDefaultLocale());

  it("falls back to Bengali when no database is configured", async () => {
    expect(await getStoreDefaultLocale({})).toBe("bn");
  });

  it("falls back to Bengali when the database cannot be reached, within the timeout", async () => {
    const started = Date.now();
    expect(await getStoreDefaultLocale({ MONGODB_URI: "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200&directConnection=true" })).toBe("bn");
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
