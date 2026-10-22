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
    /** Free delivery at or above this merchandise subtotal after the coupon (domain-rules §5.4). */
    freeThreshold: money().optional(),
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
    pricing: z
      .object({
        roundingUnit: zInt().min(1).max(10000),
        /** Coupons also discount flash-sale lines (domain-rules §5.3; default false). */
        couponsApplyToFlashSale: z.boolean().optional(),
      })
      .strict(),
    features: z
      .object({
        wishlist: z.boolean(),
        brands: z.boolean(),
        reviews: z.boolean(),
        /** Online ordering (B7). Off until the owner turns it on; never on for a store with sample products. */
        checkout: z.boolean().optional(),
        /** Loyalty points (domain-rules §5.7); stays off for a BD production store until legal review. */
        rewards: z.boolean().optional(),
      })
      .strict(),
    /** Order rules (domain-rules §3): self-cancel states and the return window. */
    orders: z
      .object({
        returnWindowDays: zInt().min(0).max(90),
        /** Flag pending orders older than this to operators (default 48 h). */
        pendingAlertHours: zInt().min(1).max(720),
        /** Order number prefix, 2–6 capital letters or digits (template default "ORD"). */
        numberPrefix: z.string().regex(/^[A-Z0-9]{2,6}$/).optional(),
      })
      .strict()
      .optional(),
    /**
     * Loyalty points rules (B9, domain-rules §5.7). Used only while `features.rewards` is on.
     * Points earned per ৳100 of goods paid for (after coupon), credited when the order completes;
     * the customer-facing copy states the expiry.
     */
    rewards: z
      .object({
        pointsPer100Taka: zInt().min(0).max(20),
        expiryDays: zInt().min(30).max(730),
      })
      .strict()
      .optional(),
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
  store: { name: { bn: "হরেকবাজার", en: "HorekBazar" }, contact: {} },
  theme: { fontPreset: "khata", accent: "#1E4E9C" },
  locale: { default: "bn", numerals: "bengali", grouping: "south_asian" },
  delivery: { zones: [] },
  pricing: { roundingUnit: 100 },
  features: { wishlist: false, brands: false, reviews: false },
  version: 0,
};
