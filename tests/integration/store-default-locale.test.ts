// Phase F part 2 (D31): the proxy's store-default reader against a real (disposable) replica set.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db, MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import type { Actor } from "@/lib/modules/catalogue/common";
import { SETTINGS } from "@/lib/modules/settings/schema";
import { getSettings, updateGeneralSettings } from "@/lib/modules/settings/settings";
import { forgetStoreDefaultLocale, getStoreDefaultLocale } from "@/lib/i18n/store-default-locale";
import { freshDb } from "./helpers";

let db: Db;
let client: MongoClient;
let env: Record<string, string>;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "store_manager" };
const general = (def: "bn" | "en") => ({
  store: { name: { bn: "হরেকবাজার", en: "HorekBazar" }, contact: {} },
  theme: { fontPreset: "khata" as const, accent: "#1E4E9C" },
  locale: { default: def, numerals: "bengali" as const, grouping: "south_asian" as const },
  pricing: { roundingUnit: 100 },
  features: { wishlist: false, brands: false, reviews: false },
});

beforeAll(async () => {
  let uri: string, dbName: string;
  ({ client, db, cleanup, uri, dbName } = await freshDb());
  env = { MONGODB_URI: uri, MONGODB_DB: dbName };
  await runMigrations(db);
});
afterAll(async () => {
  forgetStoreDefaultLocale();
  await cleanup();
});
afterEach(() => forgetStoreDefaultLocale());

describe("store default language", () => {
  it("is Bengali before the first settings save", async () => {
    expect(await getStoreDefaultLocale(env)).toBe("bn");
  });

  it("follows the saved setting once the memo is cleared (as the admin save does)", async () => {
    expect(await getStoreDefaultLocale(env)).toBe("bn");
    await updateGeneralSettings(db, actor, (await getSettings(db)).version, general("en"));
    forgetStoreDefaultLocale();
    expect(await getStoreDefaultLocale(env)).toBe("en");
  });

  it("is memoised until cleared or expired", async () => {
    expect(await getStoreDefaultLocale(env)).toBe("en");
    await updateGeneralSettings(db, actor, (await getSettings(db)).version, general("bn"));
    expect(await getStoreDefaultLocale(env)).toBe("en");
    expect(await getStoreDefaultLocale(env, Date.now() + 61_000)).toBe("bn");
  });

  it("falls back to Bengali for a value that is not a supported language", async () => {
    // A direct database edit the validator would normally reject; bypass it to prove the fallback.
    await db.command({ collMod: SETTINGS, validationLevel: "off" });
    await db.collection(SETTINGS).updateOne({ _id: "settings" as never }, { $set: { "locale.default": "fr" } });
    expect(await getStoreDefaultLocale(env)).toBe("bn");
    void client;
  });
});
