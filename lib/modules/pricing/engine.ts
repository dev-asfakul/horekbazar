// Pricing engine (domain-rules §5.2–§5.4, §5.6). Pure and synchronous: the cart, the checkout quote
// and order placement all call `priceOrder` with data read from the database, and placement snapshots
// the result onto the order. Money is integer poisha throughout; rounding happens only where §5
// says (unit price to 1 poisha after a percentage, line totals and percentage coupons to roundingUnit).
// Relative imports only: this file also runs under Node's type stripping (scripts) and in unit tests.

export type DiscountType = "percent" | "fixed";

export interface PriceLineInput {
  /** The cart line key (variantId); order lines get their lineId at placement. */
  variantId: string;
  productId: string;
  /** The product's categories including every ancestor, for promotion and coupon scopes. */
  categoryIds: string[];
  unitPrice: number;
  compareAt?: number | undefined;
  quantity: number;
  /** Quantity tiers: the unit price from `minQty` units (§5.2 step 3). */
  tiers?: { minQty: number; unitPrice: number }[] | undefined;
  /** Product-level free-delivery flag (§5.4). */
  freeDelivery?: boolean | undefined;
}

export interface PromotionRule {
  id: string;
  kind: "product" | "flash_sale";
  discount: { type: DiscountType; value: number };
  scope: { type: "all" | "categories" | "products" | "variants"; ids: string[] };
  startsAt: Date;
  endsAt?: Date | undefined;
  /** Flash-sale units still available under the sale's cap; undefined = no cap. */
  remaining?: number | undefined;
}

export interface CouponRule {
  id: string;
  code: string;
  kind: "percent" | "fixed" | "free_delivery";
  /** Percent: 1–100. Fixed: poisha. Free delivery: unused (0). */
  value: number;
  maxDiscount?: number | undefined;
  minSubtotal?: number | undefined;
  /** Free delivery: the most of the fee the coupon covers. */
  maxFee?: number | undefined;
  startsAt: Date;
  endsAt?: Date | undefined;
  status: "draft" | "active" | "archived";
  usageLimit?: number | undefined;
  used: number;
  perCustomerLimit?: number | undefined;
  /** This customer's redemptions of the coupon (0 for a signed-out cart). */
  customerUsed: number;
  firstOrderOnly: boolean;
  /** Whether the customer already has an order (first-order coupons). */
  customerHasOrders: boolean;
  include: { categoryIds: string[]; productIds: string[] };
  exclude: { categoryIds: string[]; productIds: string[] };
  /** Free delivery: the zones it covers; empty = all zones. */
  zoneIds: string[];
}

export interface ZoneRule {
  id: string;
  fee: number;
  /** Free delivery at or above this merchandise subtotal after the coupon discount (§5.4). */
  freeThreshold?: number | undefined;
}

export interface PricingSettings {
  roundingUnit: number;
  /** Lines on a flash sale are excluded from coupons unless true (§5.3, default false). */
  couponsApplyToFlashSale: boolean;
}

export type CouponProblem =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "limit_reached"
  | "already_used"
  | "first_order_only"
  | "not_eligible"
  | "min_not_met"
  | "zone_not_covered"
  | "not_needed";

export interface PricedLine {
  variantId: string;
  productId: string;
  quantity: number;
  basePrice: number;
  compareAt?: number | undefined;
  unitPrice: number;
  lineTotal: number;
  appliedPromotion?: { id: string; kind: "product" | "flash_sale" } | undefined;
  tierMinQty?: number | undefined;
  couponEligible: boolean;
  /** This line's share of the order-level coupon discount (largest remainder, §5.3). */
  couponAllocation: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  merchandise: number;
  coupon:
    | { code: string; id: string; kind: CouponRule["kind"]; applied: true; discount: number; deliveryCovered: number }
    | { code: string; id?: string; applied: false; problem: CouponProblem; missing?: number }
    | null;
  delivery: { zoneId: string; fee: number; baseFee: number; free: "threshold" | "products" | "coupon" | null; missingForFree?: number } | null;
  rewards: number;
  /** merchandise − coupon discount + delivery − rewards, never below zero (§5.2 step 9). */
  total: number;
}

/** Half-up rounding of a non-negative amount to a multiple of `unit` (§5.1). */
export function roundTo(amount: number, unit: number): number {
  if (unit <= 1) return Math.round(amount);
  return Math.floor((amount + unit / 2) / unit) * unit;
}

/** Applies a discount to a unit price: percentages round to 1 poisha (half-up); never below zero. */
export function discounted(unitPrice: number, discount: { type: DiscountType; value: number }): number {
  if (discount.type === "percent") return Math.max(0, unitPrice - Math.floor((unitPrice * discount.value + 50) / 100));
  return Math.max(0, unitPrice - discount.value);
}

const inScope = (p: PromotionRule, line: PriceLineInput) => {
  switch (p.scope.type) {
    case "all":
      return true;
    case "categories":
      return line.categoryIds.some((c) => p.scope.ids.includes(c));
    case "products":
      return p.scope.ids.includes(line.productId);
    case "variants":
      return p.scope.ids.includes(line.variantId);
  }
};

const live = (startsAt: Date, endsAt: Date | undefined, now: Date) => startsAt <= now && (!endsAt || endsAt > now);

/** Steps 1–4 for one line. */
export function priceLine(line: PriceLineInput, promotions: PromotionRule[], settings: PricingSettings, now: Date): Omit<PricedLine, "couponEligible" | "couponAllocation"> {
  let best: { unit: number; promo?: PromotionRule } = { unit: line.unitPrice };
  let flash = false;
  for (const p of promotions) {
    if (!live(p.startsAt, p.endsAt, now) || !inScope(p, line)) continue;
    // A flash sale with a cap applies only when the cap still covers the whole line.
    if (p.kind === "flash_sale" && (!p.endsAt || (p.remaining !== undefined && p.remaining < line.quantity))) continue;
    const unit = discounted(line.unitPrice, p.discount);
    const better = unit < best.unit || (unit === best.unit && best.promo !== undefined && p.kind === "flash_sale" && best.promo.kind !== "flash_sale");
    if (better && unit < line.unitPrice) best = { unit, promo: p };
  }
  if (best.promo?.kind === "flash_sale") flash = true;
  let tierMinQty: number | undefined;
  if (!flash && line.tiers?.length) {
    const tier = [...line.tiers].filter((t) => t.minQty <= line.quantity).sort((a, b) => b.minQty - a.minQty)[0];
    // A tier and a product promotion never stack: the lower unit price wins (§5.2 step 3).
    if (tier && tier.unitPrice < best.unit) {
      best = { unit: tier.unitPrice };
      tierMinQty = tier.minQty;
    }
  }
  return {
    variantId: line.variantId,
    productId: line.productId,
    quantity: line.quantity,
    basePrice: line.unitPrice,
    ...(line.compareAt !== undefined ? { compareAt: line.compareAt } : {}),
    unitPrice: best.unit,
    lineTotal: roundTo(best.unit * line.quantity, settings.roundingUnit),
    ...(best.promo ? { appliedPromotion: { id: best.promo.id, kind: best.promo.kind } } : {}),
    ...(tierMinQty !== undefined ? { tierMinQty } : {}),
  };
}

/** Splits `amount` across `weights` pro rata with the largest-remainder method; parts sum exactly to `amount`. */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);
  const A = BigInt(amount);
  const W = BigInt(total);
  const parts = weights.map((w) => (A * BigInt(w)) / W);
  const rems = weights.map((w, i) => ({ i, r: (A * BigInt(w)) % W }));
  let left = Number(A - parts.reduce((a, b) => a + b, 0n));
  rems.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of rems) {
    if (left <= 0) break;
    parts[i]! += 1n;
    left--;
  }
  return parts.map(Number);
}

function couponEligibleLine(c: CouponRule, line: PriceLineInput, priced: { appliedPromotion?: { kind: string } | undefined }, settings: PricingSettings) {
  if (priced.appliedPromotion?.kind === "flash_sale" && !settings.couponsApplyToFlashSale) return false;
  if (c.exclude.productIds.includes(line.productId) || line.categoryIds.some((id) => c.exclude.categoryIds.includes(id))) return false;
  const hasInclude = c.include.productIds.length > 0 || c.include.categoryIds.length > 0;
  if (!hasInclude) return true;
  return c.include.productIds.includes(line.productId) || line.categoryIds.some((id) => c.include.categoryIds.includes(id));
}

/** The first rule a coupon breaks before eligibility is looked at, or null. */
export function couponStateProblem(c: CouponRule, now: Date): CouponProblem | null {
  if (c.status !== "active") return "inactive";
  if (c.startsAt > now) return "not_started";
  if (c.endsAt && c.endsAt <= now) return "expired";
  if (c.usageLimit !== undefined && c.used >= c.usageLimit) return "limit_reached";
  if (c.perCustomerLimit !== undefined && c.customerUsed >= c.perCustomerLimit) return "already_used";
  if (c.firstOrderOnly && c.customerHasOrders) return "first_order_only";
  return null;
}

export interface PriceOrderInput {
  lines: PriceLineInput[];
  promotions: PromotionRule[];
  /** The coupon the customer entered; `null` rule with a code means the code does not exist. */
  coupon?: { code: string; rule: CouponRule | null } | undefined;
  zone?: ZoneRule | undefined;
  settings: PricingSettings;
  rewards?: number | undefined;
  now: Date;
}

/** Steps 1–9 of §5.2 for a whole cart or order. */
export function priceOrder(input: PriceOrderInput): PricedOrder {
  const { settings, now } = input;
  const base = input.lines.map((l) => priceLine(l, input.promotions, settings, now));
  const merchandise = base.reduce((a, l) => a + l.lineTotal, 0);
  let lines: PricedLine[] = base.map((l) => ({ ...l, couponEligible: false, couponAllocation: 0 }));
  let coupon: PricedOrder["coupon"] = null;
  let discount = 0;
  let freeDeliveryCoupon: CouponRule | null = null;

  if (input.coupon) {
    const rule = input.coupon.rule;
    const code = input.coupon.code;
    const problem = rule ? couponStateProblem(rule, now) : "not_found";
    if (!rule || problem) coupon = { code, ...(rule ? { id: rule.id } : {}), applied: false, problem: problem ?? "not_found" };
    else {
      const eligible = input.lines.map((l, i) => couponEligibleLine(rule, l, base[i]!, settings));
      const eligibleSubtotal = base.reduce((a, l, i) => a + (eligible[i] ? l.lineTotal : 0), 0);
      if (eligibleSubtotal === 0) coupon = { code, id: rule.id, applied: false, problem: "not_eligible" };
      else if (rule.minSubtotal !== undefined && eligibleSubtotal < rule.minSubtotal) coupon = { code, id: rule.id, applied: false, problem: "min_not_met", missing: rule.minSubtotal - eligibleSubtotal };
      else if (rule.kind === "free_delivery") {
        freeDeliveryCoupon = rule;
        lines = lines.map((l, i) => ({ ...l, couponEligible: eligible[i]! }));
      } else {
        discount =
          rule.kind === "percent"
            ? Math.min(roundTo((eligibleSubtotal * rule.value) / 100, settings.roundingUnit), rule.maxDiscount ?? Number.MAX_SAFE_INTEGER, eligibleSubtotal)
            : Math.min(rule.value, eligibleSubtotal);
        const shares = allocate(discount, base.map((l, i) => (eligible[i] ? l.lineTotal : 0)));
        lines = lines.map((l, i) => ({ ...l, couponEligible: eligible[i]!, couponAllocation: shares[i]! }));
        coupon = { code, id: rule.id, kind: rule.kind, applied: true, discount, deliveryCovered: 0 };
      }
    }
  }

  let delivery: PricedOrder["delivery"] = null;
  if (input.zone) {
    const zone = input.zone;
    const afterCoupon = merchandise - discount;
    const thresholdMet = zone.freeThreshold !== undefined && afterCoupon >= zone.freeThreshold;
    const allFlagged = input.lines.length > 0 && input.lines.every((l) => l.freeDelivery);
    const missingForFree = zone.freeThreshold !== undefined && !thresholdMet ? zone.freeThreshold - afterCoupon : undefined;
    if (thresholdMet || allFlagged || zone.fee === 0) {
      delivery = { zoneId: zone.id, fee: 0, baseFee: zone.fee, free: thresholdMet ? "threshold" : allFlagged ? "products" : null };
      // A store rule already makes delivery free: the free-delivery coupon is not consumed (§5.4).
      if (freeDeliveryCoupon) coupon = { code: freeDeliveryCoupon.code, id: freeDeliveryCoupon.id, applied: false, problem: "not_needed" };
    } else if (freeDeliveryCoupon) {
      if (freeDeliveryCoupon.zoneIds.length > 0 && !freeDeliveryCoupon.zoneIds.includes(zone.id)) {
        coupon = { code: freeDeliveryCoupon.code, id: freeDeliveryCoupon.id, applied: false, problem: "zone_not_covered" };
        delivery = { zoneId: zone.id, fee: zone.fee, baseFee: zone.fee, free: null, ...(missingForFree !== undefined ? { missingForFree } : {}) };
      } else {
        const covered = Math.min(zone.fee, freeDeliveryCoupon.maxFee ?? zone.fee);
        coupon = { code: freeDeliveryCoupon.code, id: freeDeliveryCoupon.id, kind: "free_delivery", applied: true, discount: 0, deliveryCovered: covered };
        delivery = { zoneId: zone.id, fee: zone.fee - covered, baseFee: zone.fee, free: covered === zone.fee ? "coupon" : null };
      }
    } else delivery = { zoneId: zone.id, fee: zone.fee, baseFee: zone.fee, free: null, ...(missingForFree !== undefined ? { missingForFree } : {}) };
  } else if (freeDeliveryCoupon) {
    // No zone chosen yet (cart): the coupon is valid; its effect is shown once a zone is known.
    coupon = { code: freeDeliveryCoupon.code, id: freeDeliveryCoupon.id, kind: "free_delivery", applied: true, discount: 0, deliveryCovered: 0 };
  }

  const beforeRewards = merchandise - discount + (delivery?.fee ?? 0);
  const rewards = Math.max(0, Math.min(input.rewards ?? 0, beforeRewards));
  return { lines, merchandise, coupon, delivery, rewards, total: Math.max(0, beforeRewards - rewards) };
}
