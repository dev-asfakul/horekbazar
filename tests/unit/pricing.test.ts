// Pricing engine: one test per domain-rules §5 rule (B6 pass criterion).
import { describe, expect, it } from "vitest";
import { allocate, discounted, priceOrder, roundTo, type CouponRule, type PriceLineInput, type PromotionRule } from "@/lib/modules/pricing/engine";

const now = new Date("2026-10-22T06:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");
const future = new Date("2026-11-01T00:00:00Z");
const settings = { roundingUnit: 100, couponsApplyToFlashSale: false };
const line = (over: Partial<PriceLineInput> = {}): PriceLineInput => ({ variantId: "v1", productId: "p1", categoryIds: ["c1"], unitPrice: 10000, quantity: 1, ...over });
const promo = (over: Partial<PromotionRule> = {}): PromotionRule => ({ id: "pr1", kind: "product", discount: { type: "percent", value: 10 }, scope: { type: "all", ids: [] }, startsAt: past, ...over });
const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({
  id: "cp1",
  code: "SAVE",
  kind: "percent",
  value: 10,
  startsAt: past,
  status: "active",
  used: 0,
  customerUsed: 0,
  firstOrderOnly: false,
  customerHasOrders: false,
  include: { categoryIds: [], productIds: [] },
  exclude: { categoryIds: [], productIds: [] },
  zoneIds: [],
  ...over,
});
const price = (lines: PriceLineInput[], extra: Partial<Parameters<typeof priceOrder>[0]> = {}) => priceOrder({ lines, promotions: [], settings, now, ...extra });

describe("money and rounding (§5.1)", () => {
  it("rounds half up to the rounding unit", () => {
    expect(roundTo(8549, 100)).toBe(8500);
    expect(roundTo(8550, 100)).toBe(8600);
    expect(roundTo(8551, 1)).toBe(8551);
  });
  it("percentage discounts round the unit price to one poisha, never below zero", () => {
    expect(discounted(999, { type: "percent", value: 15 })).toBe(849); // 149.85 → 150 off
    expect(discounted(500, { type: "fixed", value: 900 })).toBe(0);
  });
});

describe("resolution order (§5.2)", () => {
  it("uses the base price with no promotion and rounds the line total", () => {
    const r = price([line({ unitPrice: 8550, quantity: 1 })]);
    expect(r.lines[0]!.lineTotal).toBe(8600);
    expect(r.total).toBe(8600);
  });
  it("applies the single best automatic promotion; promotions never stack", () => {
    const r = price([line()], { promotions: [promo({ id: "a", discount: { type: "percent", value: 10 } }), promo({ id: "b", discount: { type: "fixed", value: 1500 } })] });
    expect(r.lines[0]!.unitPrice).toBe(8500);
    expect(r.lines[0]!.appliedPromotion?.id).toBe("b");
  });
  it("a tie goes to the flash sale", () => {
    const r = price([line()], { promotions: [promo({ id: "p" }), promo({ id: "f", kind: "flash_sale", endsAt: future })] });
    expect(r.lines[0]!.appliedPromotion).toEqual({ id: "f", kind: "flash_sale" });
  });
  it("ignores promotions outside their window or scope", () => {
    const r = price([line()], { promotions: [promo({ startsAt: future }), promo({ endsAt: past }), promo({ scope: { type: "categories", ids: ["other"] } })] });
    expect(r.lines[0]!.appliedPromotion).toBeUndefined();
  });
  it("a flash sale needs a real end time and enough capped units", () => {
    expect(price([line()], { promotions: [promo({ kind: "flash_sale" })] }).lines[0]!.appliedPromotion).toBeUndefined();
    expect(price([line({ quantity: 3 })], { promotions: [promo({ kind: "flash_sale", endsAt: future, remaining: 2 })] }).lines[0]!.appliedPromotion).toBeUndefined();
  });
  it("quantity tiers apply only without a flash sale, and the lower of tier and promotion wins", () => {
    const tiers = [{ minQty: 5, unitPrice: 8000 }];
    expect(price([line({ quantity: 5, tiers })], { promotions: [promo()] }).lines[0]!.unitPrice).toBe(8000);
    expect(price([line({ quantity: 4, tiers })], { promotions: [promo()] }).lines[0]!.unitPrice).toBe(9000);
    const flash = price([line({ quantity: 5, tiers })], { promotions: [promo({ kind: "flash_sale", endsAt: future, discount: { type: "percent", value: 5 } })] });
    expect(flash.lines[0]!.unitPrice).toBe(9500);
  });
});

describe("coupons (§5.3)", () => {
  it("percentage on the eligible subtotal, rounded and capped", () => {
    const r = price([line({ unitPrice: 33300 })], { coupon: { code: "SAVE", rule: coupon({ value: 15, maxDiscount: 4000 }) } });
    expect(r.coupon).toMatchObject({ applied: true, discount: 4000 });
    expect(r.total).toBe(29300);
  });
  it("fixed amount never exceeds the eligible subtotal", () => {
    const r = price([line({ unitPrice: 5000 })], { coupon: { code: "SAVE", rule: coupon({ kind: "fixed", value: 9000 }) } });
    expect(r.coupon).toMatchObject({ applied: true, discount: 5000 });
    expect(r.total).toBe(0);
  });
  it("excludes flash-sale lines by default", () => {
    const lines = [line({ variantId: "a" }), line({ variantId: "b", productId: "p2" })];
    const r = price(lines, { promotions: [promo({ kind: "flash_sale", endsAt: future, scope: { type: "variants", ids: ["a"] } })], coupon: { code: "SAVE", rule: coupon() } });
    expect(r.lines.map((l) => l.couponEligible)).toEqual([false, true]);
    expect(r.coupon).toMatchObject({ discount: 1000 });
  });
  it("honours include and exclude lists", () => {
    const lines = [line({ variantId: "a", productId: "p1", categoryIds: ["food"] }), line({ variantId: "b", productId: "p2", categoryIds: ["soap"] })];
    expect(price(lines, { coupon: { code: "S", rule: coupon({ include: { categoryIds: ["food"], productIds: [] } }) } }).lines.map((l) => l.couponEligible)).toEqual([true, false]);
    expect(price(lines, { coupon: { code: "S", rule: coupon({ exclude: { categoryIds: [], productIds: ["p1"] } }) } }).lines.map((l) => l.couponEligible)).toEqual([false, true]);
  });
  it("minimum subtotal is checked on eligible lines and reports the amount missing", () => {
    const r = price([line({ unitPrice: 30000 })], { coupon: { code: "S", rule: coupon({ minSubtotal: 50000 }) } });
    expect(r.coupon).toEqual({ code: "S", id: "cp1", applied: false, problem: "min_not_met", missing: 20000 });
  });
  it("gives a specific reason for each refusal", () => {
    const cases: [Partial<CouponRule>, string][] = [
      [{ status: "draft" }, "inactive"],
      [{ startsAt: future }, "not_started"],
      [{ endsAt: past }, "expired"],
      [{ usageLimit: 5, used: 5 }, "limit_reached"],
      [{ perCustomerLimit: 1, customerUsed: 1 }, "already_used"],
      [{ firstOrderOnly: true, customerHasOrders: true }, "first_order_only"],
      [{ include: { categoryIds: ["x"], productIds: [] } }, "not_eligible"],
    ];
    for (const [over, problem] of cases) expect(price([line()], { coupon: { code: "S", rule: coupon(over) } }).coupon).toMatchObject({ applied: false, problem });
    expect(price([line()], { coupon: { code: "NOPE", rule: null } }).coupon).toMatchObject({ applied: false, problem: "not_found" });
  });
  it("allocates the discount to lines with the largest remainder, summing exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1000, [3333, 3333, 3334])).toEqual([333, 333, 334]);
    const r = price([line({ variantId: "a", unitPrice: 3300 }), line({ variantId: "b", unitPrice: 3300 }), line({ variantId: "c", unitPrice: 3400 })], { coupon: { code: "S", rule: coupon({ kind: "fixed", value: 1000 }) } });
    expect(r.lines.reduce((a, l) => a + l.couponAllocation, 0)).toBe(1000);
  });
  it("allocates without overflow on large amounts", () => {
    const parts = allocate(9_000_000_001, [7_000_000_000, 2_000_000_001, 3]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9_000_000_001);
  });
});

describe("delivery (§5.4)", () => {
  const zone = { id: "dhaka", fee: 6000, freeThreshold: 100000 };
  it("charges the zone fee and says how much more is needed for free delivery", () => {
    const r = price([line({ unitPrice: 80000 })], { zone });
    expect(r.delivery).toMatchObject({ fee: 6000, missingForFree: 20000 });
    expect(r.total).toBe(86000);
  });
  it("threshold is measured after the coupon discount", () => {
    const r = price([line({ unitPrice: 105000 })], { zone, coupon: { code: "S", rule: coupon({ kind: "fixed", value: 10000 }) } });
    expect(r.delivery).toMatchObject({ fee: 6000, missingForFree: 5000 });
  });
  it("free when every line is flagged; mixed carts pay", () => {
    expect(price([line({ freeDelivery: true })], { zone }).delivery).toMatchObject({ fee: 0, free: "products" });
    expect(price([line({ freeDelivery: true }), line({ variantId: "b" })], { zone }).delivery).toMatchObject({ fee: 6000 });
  });
  it("a free-delivery coupon covers the fee up to its cap, for its zones only", () => {
    expect(price([line()], { zone, coupon: { code: "F", rule: coupon({ kind: "free_delivery", value: 0 }) } }).delivery).toMatchObject({ fee: 0, free: "coupon" });
    expect(price([line()], { zone, coupon: { code: "F", rule: coupon({ kind: "free_delivery", value: 0, maxFee: 4000 }) } }).delivery).toMatchObject({ fee: 2000 });
    expect(price([line()], { zone, coupon: { code: "F", rule: coupon({ kind: "free_delivery", value: 0, zoneIds: ["outside"] }) } }).coupon).toMatchObject({ problem: "zone_not_covered" });
  });
  it("is not consumed when a store rule already makes delivery free", () => {
    const r = price([line({ unitPrice: 150000 })], { zone, coupon: { code: "F", rule: coupon({ kind: "free_delivery", value: 0 }) } });
    expect(r.coupon).toMatchObject({ applied: false, problem: "not_needed" });
    expect(r.delivery).toMatchObject({ fee: 0, free: "threshold" });
  });
});

describe("rewards and total (§5.2 steps 8–9)", () => {
  it("redeems last and never below zero", () => {
    const r = price([line({ unitPrice: 5000 })], { zone: { id: "z", fee: 6000 }, rewards: 50000 });
    expect(r.rewards).toBe(11000);
    expect(r.total).toBe(0);
  });
});
