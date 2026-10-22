// Reviews service (B9; domain-rules §10.4, SCHEMA.md → reviews). Customers review products they
// received; staff with `reviews.moderate` publish, reject (with a reason the author sees) or reply.
// Only published reviews are public and counted in the product's rating. The feature is off until
// the store turns on `features.reviews`; while off, nothing is shown and nothing can be written.
import { ObjectId, type Db } from "mongodb";
import { isDuplicateKey, toObjectId, type Actor } from "../catalogue/common.ts";
import { ORDERS, type OrderDoc } from "../orders/schema.ts";
import { recordAudit } from "../platform/audit.ts";
import { CommerceError } from "../pricing/cart.ts";
import { REVIEWS, reviewSchema, type ReviewDoc } from "./schema.ts";

export interface CustomerRef {
  id: string;
  name: string;
}

const clean = (s: string | undefined) => {
  // Plain text only: drop control characters (keep newlines) and collapse runs of blank lines.
  const v = (s ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return v === "" ? undefined : v;
};

/** First word of the account name: reviews never show a full name or an e-mail address. */
export const reviewAuthorName = (name: string) => (name.trim().split(/\s+/)[0] ?? "").slice(0, 60) || "Customer";

const oid = (id: string) => {
  try {
    return toObjectId(id);
  } catch {
    throw new CommerceError("not_found");
  }
};

/** Order lines this customer may review: line delivered, order delivered or completed. */
export async function reviewableLines(db: Db, userId: string) {
  const orders = await db
    .collection<OrderDoc>(ORDERS)
    .find({ userId, status: { $in: ["delivered", "completed"] } }, { projection: { lines: 1, orderNumber: 1, placedAt: 1 } })
    .sort({ placedAt: -1 })
    .limit(100)
    .toArray();
  const mine = await db.collection<ReviewDoc>(REVIEWS).find({ userId }, { projection: { productId: 1, status: 1, rating: 1 } }).toArray();
  const reviewed = new Map(mine.map((r) => [String(r.productId), r]));
  const seen = new Set<string>();
  const lines: { orderId: string; orderNumber: string; lineId: string; productId: string; slug: string; name: OrderDoc["lines"][number]["name"]; review?: { status: ReviewDoc["status"]; rating: number } }[] = [];
  for (const o of orders) {
    for (const l of o.lines) {
      if (l.status !== "delivered" || seen.has(String(l.productId))) continue;
      seen.add(String(l.productId));
      const r = reviewed.get(String(l.productId));
      lines.push({ orderId: String(o._id), orderNumber: o.orderNumber, lineId: l.lineId, productId: String(l.productId), slug: l.slug, name: l.name, ...(r ? { review: { status: r.status, rating: r.rating } } : {}) });
    }
  }
  return lines;
}

export interface ReviewInput {
  orderId: string;
  lineId: string;
  rating: number;
  title?: string;
  body: string;
}

/** Creates a pending review. Refuses when reviews are off, the line is not the customer's delivered line, or a review exists. */
export async function submitReview(db: Db, customer: CustomerRef, input: ReviewInput, options: { enabled: boolean; now?: Date }) {
  if (!options.enabled) throw new CommerceError("reviews_off");
  const now = options.now ?? new Date();
  const order = await db.collection<OrderDoc>(ORDERS).findOne({ _id: oid(input.orderId), userId: customer.id });
  if (!order) throw new CommerceError("not_found");
  const line = order.lines.find((l) => l.lineId === input.lineId);
  if (!line) throw new CommerceError("not_found");
  if (!["delivered", "completed"].includes(order.status) || line.status !== "delivered") throw new CommerceError("review_not_eligible");
  const doc: ReviewDoc = {
    _id: new ObjectId(),
    userId: customer.id,
    productId: line.productId,
    orderId: order._id,
    lineId: line.lineId,
    rating: input.rating,
    ...(clean(input.title) ? { title: clean(input.title)! } : {}),
    body: clean(input.body) ?? "",
    authorName: reviewAuthorName(customer.name),
    status: "pending",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const parsed = reviewSchema.safeParse(doc);
  if (!parsed.success) throw new CommerceError("review_invalid");
  try {
    await db.collection<ReviewDoc>(REVIEWS).insertOne(parsed.data);
  } catch (error) {
    if (isDuplicateKey(error)) throw new CommerceError("review_exists");
    throw error;
  }
  return { id: String(doc._id) };
}

export type ModerationStep = { kind: "publish" } | { kind: "reject"; reason: string } | { kind: "reply"; body: string };

/** Staff moderation with compare-and-set on `version`; every step is audited. */
export async function moderateReview(db: Db, actor: Actor, reviewId: string, expectedVersion: number, step: ModerationStep, now = new Date()) {
  const col = db.collection<ReviewDoc>(REVIEWS);
  const before = await col.findOne({ _id: oid(reviewId) });
  if (!before) throw new CommerceError("not_found");
  if (before.version !== expectedVersion) throw new CommerceError("version_conflict");
  let set: Partial<ReviewDoc>;
  const unset: Record<string, ""> = {};
  if (step.kind === "publish") {
    if (before.status === "published") throw new CommerceError("transition_not_allowed");
    set = { status: "published", moderatedBy: actor.id, moderatedAt: now };
    unset.rejectionReason = "";
  } else if (step.kind === "reject") {
    const reason = clean(step.reason);
    if (!reason || reason.length > 300) throw new CommerceError("reason_required");
    if (before.status === "rejected") throw new CommerceError("transition_not_allowed");
    set = { status: "rejected", rejectionReason: reason, moderatedBy: actor.id, moderatedAt: now };
  } else {
    const body = clean(step.body);
    if (!body || body.length > 1000) throw new CommerceError("review_invalid");
    if (before.status !== "published") throw new CommerceError("transition_not_allowed");
    set = { reply: { body, by: actor.id, at: now } };
  }
  const after = { ...before, ...set, version: before.version + 1, updatedAt: now } as ReviewDoc;
  for (const k of Object.keys(unset)) delete (after as Record<string, unknown>)[k];
  if (!reviewSchema.safeParse(after).success) throw new CommerceError("review_invalid");
  const res = await col.updateOne(
    { _id: before._id, version: expectedVersion },
    { $set: { ...set, updatedAt: now }, $inc: { version: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
  );
  if (res.matchedCount !== 1) throw new CommerceError("version_conflict");
  await recordAudit(db, {
    actor: { id: actor.id, role: actor.role },
    action: `review.${step.kind === "reply" ? "replied" : step.kind === "publish" ? "published" : "rejected"}`,
    target: { type: "review", id: String(before._id) },
    before: { status: before.status },
    after: { status: after.status, ...(step.kind === "reject" ? { reason: after.rejectionReason } : {}) },
    ip: actor.ip ?? null,
  }, { now });
  return after;
}

/** Published reviews for one product plus the rating summary (published only). */
export async function productReviews(db: Db, productId: string | ObjectId, limit = 20) {
  const id = typeof productId === "string" ? oid(productId) : productId;
  const col = db.collection<ReviewDoc>(REVIEWS);
  const [items, agg] = await Promise.all([
    col.find({ productId: id, status: "published" }).sort({ createdAt: -1 }).limit(limit).toArray(),
    col.aggregate<{ _id: null; count: number; sum: number }>([{ $match: { productId: id, status: "published" } }, { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: "$rating" } } }]).toArray(),
  ]);
  const count = agg[0]?.count ?? 0;
  return { items, count, average: count ? Math.round((agg[0]!.sum / count) * 10) / 10 : 0 };
}

export const customerReviews = (db: Db, userId: string) => db.collection<ReviewDoc>(REVIEWS).find({ userId }).sort({ createdAt: -1 }).limit(100).toArray();

export async function listReviewsForStaff(db: Db, filter: { status?: ReviewDoc["status"]; page?: number }, pageSize = 25) {
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.status ? { status: filter.status } : {};
  const col = db.collection<ReviewDoc>(REVIEWS);
  const [items, total] = await Promise.all([col.find(q).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), col.countDocuments(q)]);
  return { items, total, page, pageSize };
}

export const reviewById = (db: Db, id: string) => db.collection<ReviewDoc>(REVIEWS).findOne({ _id: oid(id) });
