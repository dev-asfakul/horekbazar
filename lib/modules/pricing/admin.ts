// Promotions and coupons administration (B6; capability promotions.write; SCHEMA.md API surface
// `promotions.upsert` / `coupons.upsert`). Optimistic `version` on every edit; every change audited.
// Rules the validator cannot express: a flash sale has a real end time after its start (§5.6); a
// percentage is 1–100; a coupon code is frozen once it has been redeemed; a free-delivery coupon has
// no amount; the scope ids must exist.
import { ObjectId, type Db } from "mongodb";
import { CATEGORIES, PRODUCTS, VARIANTS, type LocalizedText } from "../catalogue/schema.ts";
import { recordAudit } from "../platform/audit.ts";
import type { Actor } from "../catalogue/common.ts";
import { CommerceError } from "./cart.ts";
import { COUPON_CODE, COUPONS, PROMOTIONS, type CouponDoc, type PromotionDoc } from "./schema.ts";

export interface PromotionInput {
  name: LocalizedText;
  kind: PromotionDoc["kind"];
  discount: PromotionDoc["discount"];
  scope: { type: PromotionDoc["scope"]["type"]; ids: string[] };
  startsAt: Date;
  endsAt?: Date | undefined;
  cap?: number | undefined;
}

export interface CouponInput {
  code: string;
  description?: LocalizedText | undefined;
  kind: CouponDoc["kind"];
  value: number;
  maxDiscount?: number | undefined;
  minSubtotal?: number | undefined;
  maxFee?: number | undefined;
  usageLimit?: number | undefined;
  perCustomerLimit?: number | undefined;
  startsAt: Date;
  endsAt?: Date | undefined;
  firstOrderOnly: boolean;
  categoryIds: string[];
  productIds: string[];
  excludeCategoryIds: string[];
  excludeProductIds: string[];
  zoneIds: string[];
}

const oid = (id: string) => {
  if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) throw new CommerceError("not_found");
  return new ObjectId(id);
};

async function assertExist(db: Db, collection: string, ids: string[]) {
  if (ids.length === 0) return [];
  const objectIds = [...new Set(ids)].map(oid);
  const found = await db.collection(collection).countDocuments({ _id: { $in: objectIds } });
  if (found !== objectIds.length) throw new CommerceError("scope_not_found");
  return objectIds;
}

function checkDiscount(type: "percent" | "fixed", value: number) {
  if (!Number.isInteger(value) || value < 1 || (type === "percent" && value > 100)) throw new CommerceError("invalid_value");
}

async function promotionFields(db: Db, input: PromotionInput) {
  checkDiscount(input.discount.type, input.discount.value);
  if (input.endsAt && input.endsAt <= input.startsAt) throw new CommerceError("window_invalid");
  if (input.kind === "flash_sale" && !input.endsAt) throw new CommerceError("flash_needs_end");
  if (input.cap !== undefined && input.kind !== "flash_sale") throw new CommerceError("cap_flash_only");
  const collection = { categories: CATEGORIES, products: PRODUCTS, variants: VARIANTS, all: "" }[input.scope.type];
  if (input.scope.type !== "all" && input.scope.ids.length === 0) throw new CommerceError("scope_empty");
  const ids = input.scope.type === "all" ? [] : await assertExist(db, collection, input.scope.ids);
  return {
    name: input.name,
    kind: input.kind,
    discount: input.discount,
    scope: { type: input.scope.type, ids },
    startsAt: input.startsAt,
    ...(input.endsAt ? { endsAt: input.endsAt } : {}),
    ...(input.cap !== undefined ? { cap: input.cap } : {}),
  };
}

export async function listPromotions(db: Db) {
  return db.collection<PromotionDoc>(PROMOTIONS).find({}).sort({ status: 1, startsAt: -1 }).limit(200).toArray();
}

export async function createPromotion(db: Db, actor: Actor, input: PromotionInput): Promise<ObjectId> {
  const now = new Date();
  const doc = { _id: new ObjectId(), ...(await promotionFields(db, input)), sold: 0, status: "draft" as const, version: 1, createdAt: now, updatedAt: now };
  await db.collection<PromotionDoc>(PROMOTIONS).insertOne(doc);
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "promotion.created", target: { type: "promotion", id: String(doc._id) }, after: { kind: doc.kind, discount: doc.discount }, ip: actor.ip ?? null });
  return doc._id;
}

export async function updatePromotion(db: Db, actor: Actor, id: string, version: number, input: PromotionInput) {
  const fields = await promotionFields(db, input);
  const unset: Record<string, ""> = { ...(fields.endsAt ? {} : { endsAt: "" as const }), ...(fields.cap !== undefined ? {} : { cap: "" as const }) };
  const before = await db.collection<PromotionDoc>(PROMOTIONS).findOneAndUpdate(
    { _id: oid(id), version },
    { $set: { ...fields, updatedAt: new Date() }, $inc: { version: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  );
  if (!before) throw new CommerceError((await db.collection(PROMOTIONS).countDocuments({ _id: oid(id) })) ? "version_conflict" : "not_found");
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "promotion.updated", target: { type: "promotion", id }, before: { discount: before.discount, endsAt: before.endsAt }, after: { discount: fields.discount, endsAt: fields.endsAt }, ip: actor.ip ?? null });
}

export async function setPromotionStatus(db: Db, actor: Actor, id: string, version: number, status: PromotionDoc["status"]) {
  const filter = { _id: oid(id), version };
  const current = await db.collection<PromotionDoc>(PROMOTIONS).findOne({ _id: oid(id) });
  if (!current) throw new CommerceError("not_found");
  if (status === "active" && current.kind === "flash_sale" && (!current.endsAt || current.endsAt <= new Date())) throw new CommerceError("flash_needs_end");
  const res = await db.collection<PromotionDoc>(PROMOTIONS).updateOne(filter, { $set: { status, updatedAt: new Date() }, $inc: { version: 1 } });
  if (res.matchedCount === 0) throw new CommerceError("version_conflict");
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "promotion.status", target: { type: "promotion", id }, before: { status: current.status }, after: { status }, ip: actor.ip ?? null });
}

async function couponFields(db: Db, input: CouponInput) {
  const code = input.code.trim().toUpperCase();
  if (!COUPON_CODE.test(code)) throw new CommerceError("code_invalid");
  if (input.kind === "free_delivery") {
    if (input.value !== 0 || input.maxDiscount !== undefined) throw new CommerceError("invalid_value");
  } else checkDiscount(input.kind === "percent" ? "percent" : "fixed", input.value);
  if (input.maxDiscount !== undefined && input.kind !== "percent") throw new CommerceError("cap_percent_only");
  if (input.maxFee !== undefined && input.kind !== "free_delivery") throw new CommerceError("invalid_value");
  if (input.endsAt && input.endsAt <= input.startsAt) throw new CommerceError("window_invalid");
  return {
    code,
    ...(input.description ? { description: input.description } : {}),
    kind: input.kind,
    value: input.value,
    ...(input.maxDiscount !== undefined ? { maxDiscount: input.maxDiscount } : {}),
    ...(input.minSubtotal !== undefined ? { minSubtotal: input.minSubtotal } : {}),
    ...(input.maxFee !== undefined ? { maxFee: input.maxFee } : {}),
    ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
    ...(input.perCustomerLimit !== undefined ? { perCustomerLimit: input.perCustomerLimit } : {}),
    startsAt: input.startsAt,
    ...(input.endsAt ? { endsAt: input.endsAt } : {}),
    eligibility: {
      firstOrderOnly: input.firstOrderOnly,
      categoryIds: await assertExist(db, CATEGORIES, input.categoryIds),
      productIds: await assertExist(db, PRODUCTS, input.productIds),
      excludeCategoryIds: await assertExist(db, CATEGORIES, input.excludeCategoryIds),
      excludeProductIds: await assertExist(db, PRODUCTS, input.excludeProductIds),
      zoneIds: [...new Set(input.zoneIds)],
    },
  };
}

const OPTIONAL_COUPON_FIELDS = ["description", "maxDiscount", "minSubtotal", "maxFee", "usageLimit", "perCustomerLimit", "endsAt"] as const;

export async function listCoupons(db: Db) {
  return db.collection<CouponDoc>(COUPONS).find({}).sort({ status: 1, createdAt: -1 }).limit(200).toArray();
}

export async function createCoupon(db: Db, actor: Actor, input: CouponInput): Promise<ObjectId> {
  const now = new Date();
  const doc = { _id: new ObjectId(), ...(await couponFields(db, input)), used: 0, status: "draft" as const, version: 1, createdAt: now, updatedAt: now };
  try {
    await db.collection<CouponDoc>(COUPONS).insertOne(doc as CouponDoc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new CommerceError("code_taken");
    throw error;
  }
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "coupon.created", target: { type: "coupon", id: String(doc._id) }, after: { code: doc.code, kind: doc.kind, value: doc.value }, ip: actor.ip ?? null });
  return doc._id;
}

export async function updateCoupon(db: Db, actor: Actor, id: string, version: number, input: CouponInput) {
  const current = await db.collection<CouponDoc>(COUPONS).findOne({ _id: oid(id) });
  if (!current) throw new CommerceError("not_found");
  const fields = await couponFields(db, input);
  // A redeemed code is printed on orders and receipts: it cannot change.
  if (current.used > 0 && fields.code !== current.code) throw new CommerceError("code_locked");
  if (fields.usageLimit !== undefined && fields.usageLimit < current.used) throw new CommerceError("limit_below_used");
  const unset = Object.fromEntries(OPTIONAL_COUPON_FIELDS.filter((k) => (fields as Record<string, unknown>)[k] === undefined).map((k) => [k, "" as const])) as Record<string, "">;
  try {
    const res = await db.collection<CouponDoc>(COUPONS).updateOne(
      { _id: current._id, version },
      { $set: { ...fields, updatedAt: new Date() }, $inc: { version: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    );
    if (res.matchedCount === 0) throw new CommerceError("version_conflict");
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new CommerceError("code_taken");
    throw error;
  }
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "coupon.updated", target: { type: "coupon", id }, before: { code: current.code, value: current.value, usageLimit: current.usageLimit }, after: { code: fields.code, value: fields.value, usageLimit: fields.usageLimit }, ip: actor.ip ?? null });
}

export async function setCouponStatus(db: Db, actor: Actor, id: string, version: number, status: CouponDoc["status"]) {
  const before = await db.collection<CouponDoc>(COUPONS).findOneAndUpdate({ _id: oid(id), version }, { $set: { status, updatedAt: new Date() }, $inc: { version: 1 } });
  if (!before) throw new CommerceError((await db.collection(COUPONS).countDocuments({ _id: oid(id) })) ? "version_conflict" : "not_found");
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "coupon.status", target: { type: "coupon", id }, before: { status: before.status }, after: { status }, ip: actor.ip ?? null });
}
