// Pricing module schemas (B6; SCHEMA.md → promotions, coupons, couponRedemptions,
// couponCustomerUsage, carts; domain-rules §5, §4.1). Zod is the source of the committed validators.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";
import { localizedText } from "../catalogue/schema.ts";

export const PROMOTIONS = "promotions";
export const COUPONS = "coupons";
export const COUPON_REDEMPTIONS = "couponRedemptions";
export const COUPON_CUSTOMER_USAGE = "couponCustomerUsage";
export const CARTS = "carts";

export const RECORD_STATUSES = ["draft", "active", "archived"] as const;
export const COUPON_CODE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

const discount = z.object({ type: z.enum(["percent", "fixed"]), value: zInt().min(1).max(100_000_000) }).strict();

export const promotionSchema = z
  .object({
    _id: zObjectId(),
    name: localizedText(80),
    /** `flash_sale` needs a real end time (§5.6); `product` may run open-ended. */
    kind: z.enum(["product", "flash_sale"]),
    discount,
    scope: z.object({ type: z.enum(["all", "categories", "products", "variants"]), ids: z.array(zObjectId()).max(500) }).strict(),
    startsAt: zDate(),
    endsAt: zDate().optional(),
    /** Flash sales: optional unit cap, counted by `sold` with a guarded `$inc` at placement. */
    cap: zInt().min(1).max(1_000_000).optional(),
    sold: zInt().min(0),
    status: z.enum(RECORD_STATUSES),
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type PromotionDoc = z.infer<typeof promotionSchema>;

export const couponSchema = z
  .object({
    _id: zObjectId(),
    code: z.string().regex(COUPON_CODE),
    description: localizedText(160).optional(),
    kind: z.enum(["percent", "fixed", "free_delivery"]),
    /** percent: 1–100; fixed: poisha; free_delivery: 0. */
    value: zInt().min(0).max(100_000_000),
    maxDiscount: zInt().min(1).optional(),
    minSubtotal: zInt().min(1).optional(),
    maxFee: zInt().min(1).optional(),
    usageLimit: zInt().min(1).max(10_000_000).optional(),
    perCustomerLimit: zInt().min(1).max(1000).optional(),
    /** Redemptions held or consumed; guarded `$inc` against usageLimit inside the placement transaction. */
    used: zInt().min(0),
    startsAt: zDate(),
    endsAt: zDate().optional(),
    eligibility: z
      .object({
        firstOrderOnly: z.boolean(),
        categoryIds: z.array(zObjectId()).max(200),
        productIds: z.array(zObjectId()).max(500),
        excludeCategoryIds: z.array(zObjectId()).max(200),
        excludeProductIds: z.array(zObjectId()).max(500),
        zoneIds: z.array(z.string().max(40)).max(20),
      })
      .strict(),
    status: z.enum(RECORD_STATUSES),
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type CouponDoc = z.infer<typeof couponSchema>;

export const couponRedemptionSchema = z
  .object({
    _id: zObjectId(),
    couponId: zObjectId(),
    userId: z.string().min(1).max(100),
    orderId: zObjectId(),
    amount: zInt().min(0),
    /** held at placement → consumed on shipping, or released (once, compare-and-set) on cancel/reject. */
    status: z.enum(["held", "consumed", "released"]),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type CouponRedemptionDoc = z.infer<typeof couponRedemptionSchema>;

export const couponCustomerUsageSchema = z
  .object({ _id: zObjectId(), couponId: zObjectId(), userId: z.string().min(1).max(100), count: zInt().min(0), updatedAt: zDate() })
  .strict();

export const MAX_CART_LINES = 50;
export const MAX_LINE_QTY = 99;

export const cartSchema = z
  .object({
    _id: zObjectId(),
    /** A signed-in customer's cart; a device cart has `deviceId` instead (merged on sign-in). */
    userId: z.string().min(1).max(100).optional(),
    deviceId: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/).optional(),
    lines: z
      .array(
        z
          .object({
            variantId: zObjectId(),
            quantity: zInt().min(1).max(MAX_LINE_QTY),
            /** The unit price last shown to the customer: only for the "price changed" notice, never charged. */
            seenUnitPrice: zInt().min(0).optional(),
            addedAt: zDate(),
          })
          .strict(),
      )
      .max(MAX_CART_LINES),
    couponCode: z.string().regex(COUPON_CODE).optional(),
    status: z.enum(["active", "converted"]),
    /** Compare-and-set at placement (domain-rules §4.1). Bumped by every change. */
    version: zInt().min(0),
    convertedOrderId: zObjectId().optional(),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type CartDoc = z.infer<typeof cartSchema>;
