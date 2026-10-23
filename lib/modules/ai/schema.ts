// AI drafts (B9 part 2b; SCHEMA.md → aiDrafts; domain-rules §7 "ai"). Gemini proposes product text
// in Bengali and English; nothing reaches a live field until an editor applies that one field, and
// applying never changes the product's status. Drafts keep the product version they were written
// against, so the editor sees what changed since. Relative `.ts` imports keep this module runnable
// by CLI scripts.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";

export const AI_DRAFTS = "aiDrafts";

/**
 * Product fields a draft can propose, with the live field's length limit (catalogue/schema.ts).
 * Feature bullets are written into the long description: the product has no separate bullet field.
 */
export const AI_FIELDS = {
  name: 120,
  shortDescription: 300,
  description: 5000,
  seoTitle: 70,
  seoDescription: 170,
} as const;
export type AiField = keyof typeof AI_FIELDS;
export const AI_FIELD_KEYS = Object.keys(AI_FIELDS) as AiField[];

/** Both languages are required in a draft (the live field needs Bengali; English is the point of drafting). */
const draftText = (max: number) => z.object({ bn: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) }).strict();

export const aiDraftFieldsSchema = z
  .object({
    name: draftText(AI_FIELDS.name).optional(),
    shortDescription: draftText(AI_FIELDS.shortDescription).optional(),
    description: draftText(AI_FIELDS.description).optional(),
    seoTitle: draftText(AI_FIELDS.seoTitle).optional(),
    seoDescription: draftText(AI_FIELDS.seoDescription).optional(),
  })
  .strict()
  .refine((f) => Object.keys(f).length > 0, "at least one field");
export type AiDraftFields = z.infer<typeof aiDraftFieldsSchema>;

export const AI_DRAFT_STATUSES = ["pending", "partially_applied", "applied", "discarded"] as const;
export type AiDraftStatus = (typeof AI_DRAFT_STATUSES)[number];

export const aiDraftSchema = z
  .object({
    _id: zObjectId(),
    /** B9 part 2b drafts products only; category and collection are reserved (SCHEMA.md). */
    targetType: z.enum(["product", "category", "collection"]),
    targetId: zObjectId(),
    /** Product version the draft was written against. */
    targetVersion: zInt().min(1),
    fields: aiDraftFieldsSchema,
    /** The editor's note to the model, if any. */
    instructions: z.string().trim().max(300).optional(),
    model: z.string().min(1).max(80),
    status: z.enum(AI_DRAFT_STATUSES),
    appliedFields: z.array(z.enum(AI_FIELD_KEYS as [AiField, ...AiField[]])).max(AI_FIELD_KEYS.length),
    createdBy: z.string().min(1).max(100),
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type AiDraftDoc = z.infer<typeof aiDraftSchema>;
