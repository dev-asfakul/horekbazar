// Settings module (SCHEMA.md → Settings, DeliveryZone; domain-rules §8). One versioned document,
// `_id: "settings"`. Until the first save the store runs on DEFAULT_SETTINGS (never persisted
// implicitly). Delivery zones carry no area mapping until D12 (location dataset) is decided.
import { z } from "zod";
import { zDate, zInt } from "../../db/bson-zod.ts";
import { localizedText, money } from "../catalogue/schema.ts";

export const SETTINGS = "settings";
export const SETTINGS_ID = "settings";

export const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;

export const deliveryZoneSchema = z
  .object({
    id: z.string().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: localizedText(60),
    fee: money(),
    estimate: localizedText(80),
    /** Location codes; empty until D12 chooses a location dataset (SCHEMA.md → DeliveryZone). */
    areas: z.array(z.string().max(40)).max(0),
    enabled: z.boolean(),
  })
  .strict();
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;

export const settingsSchema = z
  .object({
    _id: z.literal(SETTINGS_ID),
    store: z
      .object({
        name: localizedText(60),
        contact: z
          .object({
            phone: z.string().regex(/^01[3-9][0-9]{8}$/).optional(),
            email: z.string().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).optional(),
            address: localizedText(300).optional(),
            hours: localizedText(120).optional(),
          })
          .strict(),
      })
      .strict(),
    theme: z.object({ fontPreset: z.enum(["khata", "plain"]), accent: z.string().regex(HEX_COLOUR) }).strict(),
    locale: z
      .object({ default: z.enum(["bn", "en"]), numerals: z.enum(["bengali", "latin"]), grouping: z.enum(["south_asian", "western"]) })
      .strict(),
    delivery: z.object({ zones: z.array(deliveryZoneSchema).max(20) }).strict(),
    pricing: z.object({ roundingUnit: zInt().min(1).max(10000) }).strict(),
    features: z.object({ wishlist: z.boolean(), brands: z.boolean(), reviews: z.boolean() }).strict(),
    version: zInt().min(1),
    updatedAt: zDate(),
  })
  .strict();
export type SettingsDoc = z.infer<typeof settingsSchema>;

/**
 * Defaults before the first save. Values come from DESIGN.md (wordmark, accent, Khata preset) and
 * SCHEMA.md examples; feature flags stay off until their phases ship (D16); no delivery zone or fee is
 * invented (fees are [NEEDS OWNER VALUE]).
 */
export const DEFAULT_SETTINGS: Omit<SettingsDoc, "updatedAt"> & { version: number } = {
  _id: SETTINGS_ID,
  store: { name: { bn: "HorekBazar", en: "HorekBazar" }, contact: {} },
  theme: { fontPreset: "khata", accent: "#1E4E9C" },
  locale: { default: "bn", numerals: "latin", grouping: "south_asian" },
  delivery: { zones: [] },
  pricing: { roundingUnit: 100 },
  features: { wishlist: false, brands: false, reviews: false },
  version: 0,
};
