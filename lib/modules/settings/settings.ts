// Settings service. Store identity, theme, locale, pricing and features need `settings.write`;
// delivery zones need `delivery.write` (checked by the caller). Every save is a compare-and-set on
// the singleton's `version`; the first save inserts version 1 and a concurrent first save conflicts
// on the fixed `_id`. The accent colour is saved only if it reaches 4.5:1 against white (the text on
// accent buttons) and against the page background (SCHEMA.md → theme.accent; WCAG 2.2 AA).
import type { Db } from "mongodb";
import { recordAudit } from "../platform/audit.ts";
import { CatalogueError, isDuplicateKey, type Actor } from "../catalogue/common.ts";
import { DEFAULT_SETTINGS, SETTINGS, SETTINGS_ID, settingsSchema, type DeliveryZone, type SettingsDoc } from "./schema.ts";

/** `--ground` in app/globals.css: the page background the accent sits on. */
export const PAGE_BACKGROUND = "#FAF7F0";
export const MIN_ACCENT_CONTRAST = 4.5;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

export function accentContrast(accent: string) {
  const white = contrastRatio(accent, "#FFFFFF");
  const page = contrastRatio(accent, PAGE_BACKGROUND);
  return { white, page, ok: white >= MIN_ACCENT_CONTRAST && page >= MIN_ACCENT_CONTRAST };
}

const settings = (db: Db) => db.collection<SettingsDoc>(SETTINGS);

/** The saved settings, or the defaults (version 0) before the first save. */
export async function getSettings(db: Db): Promise<Omit<SettingsDoc, "updatedAt" | "version"> & { version: number; updatedAt?: Date }> {
  return (await settings(db).findOne({ _id: SETTINGS_ID })) ?? DEFAULT_SETTINGS;
}

async function save(db: Db, actor: Actor, expectedVersion: number, next: Omit<SettingsDoc, "version" | "updatedAt">, action: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  const now = new Date();
  const doc = { ...next, version: expectedVersion + 1, updatedAt: now };
  const parsed = settingsSchema.safeParse(doc);
  if (!parsed.success) throw new CatalogueError("invalid", { issues: parsed.error.issues.map((i) => i.path.join(".")) });
  if (expectedVersion === 0) {
    try {
      await settings(db).insertOne(parsed.data);
    } catch (error) {
      if (isDuplicateKey(error)) throw new CatalogueError("version_conflict");
      throw error;
    }
  } else {
    const { _id, ...rest } = parsed.data;
    const result = await settings(db).updateOne({ _id, version: expectedVersion }, { $set: rest });
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
  }
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action, target: { type: "settings", id: SETTINGS_ID }, before, after, ip: actor.ip ?? null }, { now });
  return expectedVersion + 1;
}

// Every save writes the whole document, so each one carries the sections it does not edit unchanged
// (including the optional `orders` section, B7).
const base = (s: Awaited<ReturnType<typeof getSettings>>) => ({ _id: s._id, store: s.store, theme: s.theme, locale: s.locale, delivery: s.delivery, pricing: s.pricing, features: s.features, ...(s.orders ? { orders: s.orders } : {}) });

export type GeneralSettingsInput = Pick<SettingsDoc, "store" | "theme" | "locale" | "pricing" | "features"> & { orders?: SettingsDoc["orders"] };

export async function updateGeneralSettings(db: Db, actor: Actor, expectedVersion: number, input: GeneralSettingsInput) {
  const current = await getSettings(db);
  if (current.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: current.version });
  const accent = input.theme.accent.toUpperCase();
  if (!accentContrast(accent).ok) throw new CatalogueError("invalid", { field: "accent", ...accentContrast(accent) });
  const { store, theme, locale, pricing, features } = current;
  // Fields this form does not show (for example features.rewards) keep their stored values.
  const next = { ...base(current), ...input, theme: { ...input.theme, accent }, pricing: { ...current.pricing, ...input.pricing }, features: { ...current.features, ...input.features }, ...(input.orders ?? current.orders ? { orders: input.orders ?? current.orders } : {}) };
  return save(db, actor, expectedVersion, next, "settings.updated", { store, theme, locale, pricing, features, orders: current.orders }, { ...input, theme: { ...input.theme, accent } });
}

/** Adds or replaces the zone with the same `id`. */
export async function upsertDeliveryZone(db: Db, actor: Actor, expectedVersion: number, zone: DeliveryZone) {
  const current = await getSettings(db);
  if (current.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: current.version });
  const zones = current.delivery.zones.some((z) => z.id === zone.id) ? current.delivery.zones.map((z) => (z.id === zone.id ? zone : z)) : [...current.delivery.zones, zone];
  return save(db, actor, expectedVersion, { ...base(current), delivery: { zones } }, "delivery.zone_saved", { zone: current.delivery.zones.find((z) => z.id === zone.id) ?? null }, { zone });
}

export async function removeDeliveryZone(db: Db, actor: Actor, expectedVersion: number, zoneId: string) {
  const current = await getSettings(db);
  if (current.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: current.version });
  const zone = current.delivery.zones.find((z) => z.id === zoneId);
  if (!zone) throw new CatalogueError("not_found");
  return save(db, actor, expectedVersion, { ...base(current), delivery: { zones: current.delivery.zones.filter((z) => z.id !== zoneId) } }, "delivery.zone_removed", { zone }, { zone: null });
}
