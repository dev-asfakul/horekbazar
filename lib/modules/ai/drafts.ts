// AI drafts for product text (B9 part 2b; domain-rules §7 "ai"; BUILD-PLAN B9 "Gemini creates drafts
// only"). A draft is written to `aiDrafts` and changes nothing live. An editor applies one field at a
// time: that write checks the product version the editor saw, bumps it, records an audit row and
// never touches the product's status. Discarding a draft leaves the product as it is.
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { AiError, generateJson, type AiConfig, type GenerateOptions } from "../../adapters/ai/gemini.ts";
import { CatalogueError, inTransaction, toObjectId, type Actor } from "../catalogue/common.ts";
import { CATEGORIES, PRODUCTS, VARIANTS, type CategoryDoc, type LocalizedText, type ProductDoc, type VariantDoc } from "../catalogue/schema.ts";
import { recordAudit } from "../platform/audit.ts";
import { AI_DRAFTS, AI_FIELD_KEYS, AI_FIELDS, aiDraftFieldsSchema, type AiDraftDoc, type AiDraftFields, type AiField } from "./schema.ts";

const drafts = (db: Db) => db.collection<AiDraftDoc>(AI_DRAFTS);
const products = (db: Db) => db.collection<ProductDoc>(PRODUCTS);
const actorOf = (actor: Actor) => ({ id: actor.id, role: actor.role });
const OPEN: AiDraftDoc["status"][] = ["pending", "partially_applied"];

/** Where each draft field lives on the product. */
const PRODUCT_PATH: Record<AiField, string> = {
  name: "name",
  shortDescription: "shortDescription",
  description: "description",
  seoTitle: "seo.title",
  seoDescription: "seo.description",
};

/** The live value of a draft field (for the side-by-side view and the audit row). */
export function liveValue(product: ProductDoc, field: AiField): LocalizedText | undefined {
  switch (field) {
    case "name":
      return product.name;
    case "shortDescription":
      return product.shortDescription;
    case "description":
      return product.description;
    case "seoTitle":
      return product.seo?.title;
    case "seoDescription":
      return product.seo?.description;
  }
}

const FIELD_BRIEF: Record<AiField, string> = {
  name: "product name as shoppers search for it: what it is, variety or type, and pack size only if it is in the facts",
  shortDescription: "one or two sentences for the product card and the top of the page",
  description: "a few short paragraphs, then 3 to 6 feature lines each starting with '• ', using only the facts",
  seoTitle: "search result title, at most 60 characters, the product name first",
  seoDescription: "search result description, 120 to 160 characters, plain and specific",
};

const lt = (v: LocalizedText | undefined) => (v ? { bn: v.bn, en: v.en ?? null } : null);

/** The model's prompt: facts from the record, the editor's note, and the rules. Exported for tests. */
export function draftPrompt(facts: Record<string, unknown>, fields: AiField[], instructions?: string): string {
  return [
    "You write product text for an online shop. Write every field in Bengali (Bangla script, natural everyday Bangla as shoppers in Bangladesh write it) and in English.",
    "Use only the facts below. Do not invent weight, size, origin, ingredients, health or quality claims, certifications, awards, brand names, prices, discounts, delivery times or stock levels. If a fact is missing, leave it out.",
    "Plain text only: no Markdown, HTML, emoji or exclamation marks. Keep the Bengali and English versions equivalent in meaning.",
    `Fields to write, with what each one is and its length limit in characters:\n${fields.map((f) => `- ${f} (max ${AI_FIELDS[f]}): ${FIELD_BRIEF[f]}`).join("\n")}`,
    instructions ? `Editor's note (follow it unless it conflicts with the rules above): ${instructions}` : "",
    `Facts (JSON):\n${JSON.stringify(facts)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The JSON schema handed to Gemini for the requested fields. Exported for tests. */
export function draftJsonSchema(fields: AiField[]): Record<string, unknown> {
  const text = (max: number) => ({ type: "string", minLength: 1, maxLength: max });
  return {
    type: "object",
    properties: Object.fromEntries(fields.map((f) => [f, { type: "object", properties: { bn: text(AI_FIELDS[f]), en: text(AI_FIELDS[f]) }, required: ["bn", "en"] }])),
    required: fields,
  };
}

/** Parse the model's answer: only the requested fields, both languages, within the live limits. */
export function parseDraftAnswer(answer: unknown, fields: AiField[]): AiDraftFields {
  if (typeof answer !== "object" || answer === null) throw new AiError("ai_bad_output", "not an object");
  const picked = Object.fromEntries(fields.filter((f) => f in answer).map((f) => [f, (answer as Record<string, unknown>)[f]]));
  const parsed = aiDraftFieldsSchema.safeParse(picked);
  if (!parsed.success || Object.keys(parsed.data).length !== fields.length) throw new AiError("ai_bad_output", "fields missing, empty or too long");
  return parsed.data;
}

export interface DraftRequest {
  fields: AiField[];
  instructions?: string | undefined;
}

/** Ask Gemini for a draft of the chosen fields and store it. Nothing on the product changes. */
export async function createProductDraft(db: Db, actor: Actor, productId: string, request: DraftRequest, config: AiConfig, options: GenerateOptions & { now?: Date } = {}) {
  const fields = AI_FIELD_KEYS.filter((f) => request.fields.includes(f));
  if (fields.length === 0) throw new CatalogueError("invalid", { reason: "no fields" });
  const instructions = request.instructions?.trim().slice(0, 300) || undefined;
  const product = await products(db).findOne({ _id: toObjectId(productId) });
  if (!product) throw new CatalogueError("not_found");
  const [category, variants] = await Promise.all([
    db.collection<CategoryDoc>(CATEGORIES).findOne({ _id: product.primaryCategoryId }, { projection: { name: 1 } }),
    db.collection<VariantDoc>(VARIANTS).find({ productId: product._id, status: "active" }, { projection: { title: 1, options: 1 } }).limit(20).toArray(),
  ]);
  const facts = {
    name: lt(product.name),
    category: lt(category?.name),
    attributes: product.attributes.map((a) => ({ label: lt(a.label), value: lt(a.value) })),
    variants: variants.map((v) => lt(v.title)),
    shortDescription: lt(product.shortDescription),
    description: lt(product.description),
    seoTitle: lt(product.seo?.title),
    seoDescription: lt(product.seo?.description),
  };
  const answer = await generateJson(config, draftPrompt(facts, fields, instructions), draftJsonSchema(fields), options);
  const parsedFields = parseDraftAnswer(answer, fields);
  const now = options.now ?? new Date();
  const doc: Omit<AiDraftDoc, "_id"> = {
    targetType: "product",
    targetId: product._id,
    targetVersion: product.version,
    fields: parsedFields,
    ...(instructions ? { instructions } : {}),
    model: config.model,
    status: "pending",
    appliedFields: [],
    createdBy: actor.id,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await drafts(db).insertOne(doc as AiDraftDoc);
  await recordAudit(db, { actor: actorOf(actor), action: "ai.draft_created", target: { type: "product", id: String(product._id) }, after: { draftId: String(insertedId), fields, model: config.model }, ip: actor.ip ?? null }, { now });
  return insertedId;
}

/** Open drafts for a product, newest first. */
export function openProductDrafts(db: Db, productId: string, limit = 5) {
  return drafts(db)
    .find({ targetType: "product", targetId: toObjectId(productId), status: { $in: OPEN } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Apply one field of a draft to the product. `productVersion` is the version the editor saw; any
 * other edit since then is a conflict. Returns the product's new version.
 */
export async function applyDraftField(db: Db, client: MongoClient, actor: Actor, draftId: string, field: AiField, productVersion: number, draftVersion: number, now = new Date()) {
  if (!AI_FIELD_KEYS.includes(field)) throw new CatalogueError("invalid", { reason: "field" });
  return inTransaction(client, async (session) => {
    const draft = await drafts(db).findOne({ _id: toObjectId(draftId) }, { session });
    if (!draft || draft.targetType !== "product") throw new CatalogueError("not_found");
    if (!OPEN.includes(draft.status) || draft.version !== draftVersion) throw new CatalogueError("version_conflict");
    const value = draft.fields[field];
    if (!value || draft.appliedFields.includes(field)) throw new CatalogueError("invalid", { reason: "field" });
    const product = await products(db).findOne({ _id: draft.targetId }, { session });
    if (!product) throw new CatalogueError("not_found");
    if (product.version !== productVersion) throw new CatalogueError("version_conflict", { current: product.version });
    const before = liveValue(product, field);
    const result = await products(db).updateOne({ _id: product._id, version: productVersion }, { $set: { [PRODUCT_PATH[field]]: value, updatedAt: now }, $inc: { version: 1 } }, { session });
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    const appliedFields = [...draft.appliedFields, field];
    const remaining = (Object.keys(draft.fields) as AiField[]).filter((f) => !appliedFields.includes(f));
    const updated = await drafts(db).updateOne(
      { _id: draft._id, version: draftVersion },
      { $set: { appliedFields, status: remaining.length === 0 ? "applied" : "partially_applied", updatedAt: now }, $inc: { version: 1 } },
      { session },
    );
    if (updated.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(
      db,
      { actor: actorOf(actor), action: "product.ai_field_applied", target: { type: "product", id: String(product._id) }, before: { [field]: before ?? null }, after: { [field]: value, draftId, model: draft.model }, ip: actor.ip ?? null },
      { session, now },
    );
    return productVersion + 1;
  });
}

/** Close a draft without applying anything else. */
export async function discardDraft(db: Db, actor: Actor, draftId: string, draftVersion: number, now = new Date()) {
  const _id: ObjectId = toObjectId(draftId);
  const result = await drafts(db).findOneAndUpdate({ _id, status: { $in: OPEN }, version: draftVersion }, { $set: { status: "discarded", updatedAt: now }, $inc: { version: 1 } });
  if (!result) throw new CatalogueError("version_conflict");
  await recordAudit(db, { actor: actorOf(actor), action: "ai.draft_discarded", target: { type: "product", id: String(result.targetId) }, after: { draftId, appliedFields: result.appliedFields }, ip: actor.ip ?? null }, { now });
}
