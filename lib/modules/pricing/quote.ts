// Loads everything the pricing engine needs for a set of cart lines and runs it (domain-rules §5).
// The cart page, the checkout quote and order placement all go through `quoteLines`, so the price the
// customer sees and the price placement snapshots come from the same code. Placement passes its
// transaction session so the reads are consistent with its guarded writes.
import { ObjectId, type ClientSession, type Db } from "mongodb";
import { PRODUCTS, STOCK, VARIANTS, CATEGORIES, type CategoryDoc, type ProductDoc, type StockDoc, type VariantDoc } from "../catalogue/schema.ts";
import { DEFAULT_SETTINGS, SETTINGS, SETTINGS_ID, type DeliveryZone, type SettingsDoc } from "../settings/schema.ts";
import { priceOrder, type CouponRule, type PricedOrder, type PriceLineInput, type PromotionRule } from "./engine.ts";
import { COUPON_CUSTOMER_USAGE, COUPONS, PROMOTIONS, type CouponDoc, type PromotionDoc } from "./schema.ts";

export const ORDERS = "orders";

export type LineNotice = "unavailable" | "out_of_stock" | "insufficient_stock" | "price_up" | "price_down";

export interface QuotedLine {
  variantId: string;
  productId: string;
  quantity: number;
  /** Product and variant data for display and for the order snapshot. */
  product: Pick<ProductDoc, "slug" | "name" | "media" | "sample"> & { id: string };
  variant: Pick<VariantDoc, "sku" | "title" | "options" | "netQuantity"> & { id: string };
  available: number;
  lowStockThreshold: number;
  notices: LineNotice[];
}

export interface Quote {
  /** Lines that can be bought now (no `unavailable` notice), in cart order. */
  lines: QuotedLine[];
  /** Lines that cannot be priced (product unpublished, variant archived or gone). */
  unavailable: QuotedLine[];
  priced: PricedOrder;
  zones: DeliveryZone[];
  settings: Pick<SettingsDoc, "pricing" | "features" | "delivery"> & { orders?: SettingsDoc["orders"] };
}

export interface QuoteOptions {
  userId?: string | undefined;
  couponCode?: string | undefined;
  zoneId?: string | undefined;
  rewards?: number | undefined;
  now?: Date;
  session?: ClientSession;
  /** The unit price the customer last saw per variant (cart notices). */
  seen?: Map<string, number>;
}

function ancestorIds(categories: Map<string, CategoryDoc>, ids: ObjectId[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    let cur = categories.get(String(id));
    const visited = new Set<string>();
    while (cur && !visited.has(String(cur._id))) {
      visited.add(String(cur._id));
      out.add(String(cur._id));
      cur = cur.parentId ? categories.get(String(cur.parentId)) : undefined;
    }
  }
  return [...out];
}

export function toPromotionRule(p: PromotionDoc): PromotionRule {
  return {
    id: String(p._id),
    kind: p.kind,
    discount: p.discount,
    scope: { type: p.scope.type, ids: p.scope.ids.map(String) },
    startsAt: p.startsAt,
    ...(p.endsAt ? { endsAt: p.endsAt } : {}),
    ...(p.cap !== undefined ? { remaining: Math.max(0, p.cap - p.sold) } : {}),
  };
}

export function toCouponRule(c: CouponDoc, customer: { used: number; hasOrders: boolean; guest?: boolean }): CouponRule {
  return {
    id: String(c._id),
    code: c.code,
    kind: c.kind,
    value: c.value,
    maxDiscount: c.maxDiscount,
    minSubtotal: c.minSubtotal,
    maxFee: c.maxFee,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    status: c.status,
    usageLimit: c.usageLimit,
    used: c.used,
    perCustomerLimit: c.perCustomerLimit,
    customerUsed: customer.used,
    firstOrderOnly: c.eligibility.firstOrderOnly,
    customerHasOrders: customer.hasOrders,
    ...(customer.guest ? { guest: true } : {}),
    include: { categoryIds: c.eligibility.categoryIds.map(String), productIds: c.eligibility.productIds.map(String) },
    exclude: { categoryIds: c.eligibility.excludeCategoryIds.map(String), productIds: c.eligibility.excludeProductIds.map(String) },
    zoneIds: c.eligibility.zoneIds,
  };
}

/** Orders that count as "has ordered before" for first-order coupons: any not rejected or cancelled. */
export const COUNTING_ORDER_STATES = { $nin: ["rejected", "cancelled_by_customer", "cancelled_by_store"] };

export async function loadSettingsFor(db: Db, session?: ClientSession) {
  const doc = await db.collection<SettingsDoc>(SETTINGS).findOne({ _id: SETTINGS_ID }, session ? { session } : {});
  return doc ?? { ...DEFAULT_SETTINGS, updatedAt: new Date(0) };
}

export async function quoteLines(db: Db, cartLines: { variantId: ObjectId; quantity: number }[], options: QuoteOptions = {}): Promise<Quote> {
  const now = options.now ?? new Date();
  const s = options.session ? { session: options.session } : {};
  const settings = await loadSettingsFor(db, options.session);
  const variantIds = cartLines.map((l) => l.variantId);
  const variants = new Map((await db.collection<VariantDoc>(VARIANTS).find({ _id: { $in: variantIds } }, s).toArray()).map((v) => [String(v._id), v]));
  const productIds = [...new Set([...variants.values()].map((v) => String(v.productId)))].map((id) => new ObjectId(id));
  const products = new Map((await db.collection<ProductDoc>(PRODUCTS).find({ _id: { $in: productIds } }, s).toArray()).map((p) => [String(p._id), p]));
  const stock = new Map((await db.collection<StockDoc>(STOCK).find({ variantId: { $in: variantIds } }, s).toArray()).map((x) => [String(x.variantId), x]));
  const categories = new Map((await db.collection<CategoryDoc>(CATEGORIES).find({}, { ...s, projection: { _id: 1, parentId: 1 } }).toArray()).map((c) => [String(c._id), c]));
  const promotions = (await db.collection<PromotionDoc>(PROMOTIONS).find({ status: "active", startsAt: { $lte: now }, $or: [{ endsAt: { $exists: false } }, { endsAt: { $gt: now } }] }, s).toArray()).map(toPromotionRule);

  const lines: QuotedLine[] = [];
  const unavailable: QuotedLine[] = [];
  const inputs: PriceLineInput[] = [];
  for (const cl of cartLines) {
    const v = variants.get(String(cl.variantId));
    const p = v ? products.get(String(v.productId)) : undefined;
    const st = stock.get(String(cl.variantId));
    const ql: QuotedLine = {
      variantId: String(cl.variantId),
      productId: p ? String(p._id) : "",
      quantity: cl.quantity,
      product: { id: p ? String(p._id) : "", slug: p?.slug ?? "", name: p?.name ?? { bn: "—" }, media: p?.media ?? [], ...(p?.sample ? { sample: true as const } : {}) },
      variant: { id: String(cl.variantId), sku: v?.sku ?? "", title: v?.title ?? { bn: "—" }, options: v?.options ?? [], ...(v?.netQuantity ? { netQuantity: v.netQuantity } : {}) },
      available: st?.available ?? 0,
      lowStockThreshold: st?.lowStockThreshold ?? 0,
      notices: [],
    };
    if (!v || !p || v.status !== "active" || p.status !== "published") {
      ql.notices.push("unavailable");
      unavailable.push(ql);
      continue;
    }
    if (ql.available === 0) ql.notices.push("out_of_stock");
    else if (ql.available < cl.quantity) ql.notices.push("insufficient_stock");
    lines.push(ql);
    inputs.push({
      variantId: ql.variantId,
      productId: ql.productId,
      categoryIds: ancestorIds(categories, p.categoryIds),
      unitPrice: v.price.amountMinor,
      ...(v.compareAt ? { compareAt: v.compareAt.amountMinor } : {}),
      quantity: cl.quantity,
      ...(v.tiers?.length ? { tiers: v.tiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice.amountMinor })) } : {}),
      ...(p.freeDelivery ? { freeDelivery: true } : {}),
    });
  }

  let coupon: { code: string; rule: CouponRule | null } | undefined;
  if (options.couponCode) {
    const doc = await db.collection<CouponDoc>(COUPONS).findOne({ code: options.couponCode }, s);
    let used = 0;
    let hasOrders = false;
    if (doc && options.userId) {
      used = (await db.collection<{ count: number }>(COUPON_CUSTOMER_USAGE).findOne({ couponId: doc._id, userId: options.userId }, s))?.count ?? 0;
      hasOrders = (await db.collection(ORDERS).countDocuments({ userId: options.userId, status: COUNTING_ORDER_STATES }, { ...s, limit: 1 })) > 0;
    }
    coupon = { code: options.couponCode, rule: doc ? toCouponRule(doc, { used, hasOrders, guest: !options.userId }) : null };
  }

  const zone = options.zoneId ? settings.delivery.zones.find((z) => z.id === options.zoneId && z.enabled) : undefined;
  const priced = priceOrder({
    lines: inputs,
    promotions,
    ...(coupon ? { coupon } : {}),
    ...(zone ? { zone: { id: zone.id, fee: zone.fee.amountMinor, ...(zone.freeThreshold ? { freeThreshold: zone.freeThreshold.amountMinor } : {}) } } : {}),
    settings: { roundingUnit: settings.pricing.roundingUnit, couponsApplyToFlashSale: settings.pricing.couponsApplyToFlashSale ?? false },
    rewards: options.rewards,
    now,
  });
  if (options.seen) {
    for (const [i, pl] of priced.lines.entries()) {
      const seen = options.seen.get(pl.variantId);
      if (seen !== undefined && seen !== pl.unitPrice) lines[i]!.notices.push(pl.unitPrice > seen ? "price_up" : "price_down");
    }
  }
  return {
    lines,
    unavailable,
    priced,
    zones: settings.delivery.zones.filter((z) => z.enabled),
    settings: { pricing: settings.pricing, features: settings.features, delivery: settings.delivery, ...(settings.orders ? { orders: settings.orders } : {}) },
  };
}
