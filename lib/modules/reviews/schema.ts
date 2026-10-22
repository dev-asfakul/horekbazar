// Reviews module schema (B9; SCHEMA.md → reviews, domain-rules §10.4 "Reviews"). Zod is the source
// of the committed validator. A review is written by a signed-in customer about a product they
// received (order delivered or completed, line delivered), starts `pending`, and is public only once
// a member of staff with `reviews.moderate` publishes it. Plain text only: no HTML, no links rendered.
// One review per customer per product (SCHEMA.md unique index {userId, productId}); this is stricter
// than domain-rules' "one per order line" and never allows more than one per line.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";

export const REVIEWS = "reviews";
export const REVIEW_STATUSES = ["pending", "published", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

export const reviewSchema = z
  .object({
    _id: zObjectId(),
    userId: z.string().min(1).max(100),
    productId: zObjectId(),
    orderId: zObjectId(),
    lineId: z.string().regex(/^[a-f0-9]{24}$/),
    rating: zInt().min(1).max(5),
    title: text(120).optional(),
    body: text(2000),
    /** Snapshot of the name shown with the review (first name only, never the e-mail). */
    authorName: text(60),
    status: z.enum(REVIEW_STATUSES),
    /** Shown to the author only, when staff reject the review. */
    rejectionReason: text(300).optional(),
    reply: z.object({ body: text(1000), by: z.string().min(1).max(100), at: zDate() }).strict().optional(),
    moderatedBy: z.string().min(1).max(100).optional(),
    moderatedAt: zDate().optional(),
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type ReviewDoc = z.infer<typeof reviewSchema>;
