"use server";
// B4 catalogue admin actions: products, variants, product media, categories and stock movements.
// Each action checks its capability on the server (staffContext → decideAccess with mutation: true);
// prices, stock and status come only from the validated form and the services, never from the client
// as trusted values. Optimistic concurrency: every edit posts the version it was rendered with.
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { afterPublicWrite } from "@/lib/storefront/invalidate";
import { isOwnPublicId } from "@/lib/adapters/media/cloudinary";
import {
  checked,
  fail,
  field,
  fields,
  localized,
  ok,
  parseDecimal,
  parseInteger,
  parseTaka,
  serviceErrorCode,
  staffContext,
  versionOf,
} from "@/lib/actions/staff-action";
import type { FormState } from "@/lib/actions/form-state";
import { createCategory, deleteCategory, moveCategory, setCategoryStatus, updateCategory } from "@/lib/modules/catalogue/categories";
import { ADJUSTMENT_ID, moveStock, setLowStockThreshold } from "@/lib/modules/catalogue/inventory";
import {
  addProductMedia,
  createProduct,
  createVariant,
  deleteProduct,
  removeProductMedia,
  setProductStatus,
  setVariantStatus,
  updateProduct,
  updateVariant,
  type ProductInput,
  type VariantInput,
} from "@/lib/modules/catalogue/products";
import { NET_UNITS, SKU, SLUG, type ProductDoc } from "@/lib/modules/catalogue/schema";

const ID = /^[a-f0-9]{24}$/;
const KEY = /^[a-z][a-z0-9_]*$/;

function readSeo(form: FormData, errors: Record<string, string>) {
  const title = localized(form, "seoTitle", 70, false, errors);
  const description = localized(form, "seoDescription", 170, false, errors);
  return title || description ? { ...(title ? { title } : {}), ...(description ? { description } : {}) } : undefined;
}

/**
 * Attribute lines: `key | label (Bengali) | value (Bengali) | label (English) | value (English)`.
 * The English columns are optional. Returns null (with an error) when a line does not parse.
 */
function readAttributes(text: string, errors: Record<string, string>): ProductDoc["attributes"] {
  const out: ProductDoc["attributes"] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 30) errors.attributes = "too_many";
  for (const line of lines.slice(0, 30)) {
    const [key = "", labelBn = "", valueBn = "", labelEn = "", valueEn = ""] = line.split("|").map((c) => c.trim());
    if (!KEY.test(key) || key.length > 40 || !labelBn || !valueBn || labelBn.length > 60 || valueBn.length > 200 || labelEn.length > 60 || valueEn.length > 200) {
      errors.attributes = "attribute_line";
      continue;
    }
    out.push({ key, label: labelEn ? { bn: labelBn, en: labelEn } : { bn: labelBn }, value: valueEn ? { bn: valueBn, en: valueEn } : { bn: valueBn } });
  }
  if (new Set(out.map((a) => a.key)).size !== out.length) errors.attributes = "attribute_duplicate";
  return out;
}

function readProduct(form: FormData): { input?: Omit<ProductInput, "sample">; errors: Record<string, string>; values: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const k of ["slug", "nameBn", "nameEn", "shortDescriptionBn", "shortDescriptionEn", "descriptionBn", "descriptionEn", "primaryCategoryId", "attributes", "seoTitleBn", "seoTitleEn", "seoDescriptionBn", "seoDescriptionEn"]) values[k] = field(form, k);
  values.categoryIds = fields(form, "categoryIds").join(",");
  const slug = field(form, "slug").trim().toLowerCase();
  if (!SLUG.test(slug) || slug.length < 2 || slug.length > 80) errors.slug = "slug_invalid";
  const name = localized(form, "name", 120, true, errors);
  const shortDescription = localized(form, "shortDescription", 300, false, errors);
  const description = localized(form, "description", 5000, false, errors);
  const primaryCategoryId = field(form, "primaryCategoryId");
  if (!ID.test(primaryCategoryId)) errors.primaryCategoryId = "required";
  const extra = fields(form, "categoryIds").filter((id) => ID.test(id));
  const categoryIds = [...new Set([primaryCategoryId, ...extra])];
  if (categoryIds.length > 10) errors.categoryIds = "too_many";
  const attributes = readAttributes(field(form, "attributes"), errors);
  const seo = readSeo(form, errors);
  if (Object.keys(errors).length || !name) return { errors, values };
  return { input: { slug, name, shortDescription, description, primaryCategoryId, categoryIds, attributes, seo, freeDelivery: checked(form, "freeDelivery") ? (true as const) : undefined }, errors, values };
}

function readVariant(form: FormData): { input?: Omit<VariantInput, "sample">; errors: Record<string, string>; values: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const k of ["sku", "titleBn", "titleEn", "price", "compareAt", "netValue", "netUnit", "netVerified", "barcode", "weightGrams", "position", "options", "tiers"]) values[k] = field(form, k);
  const sku = field(form, "sku").trim().toUpperCase();
  if (!SKU.test(sku) || sku.length < 2 || sku.length > 64) errors.sku = "sku_invalid";
  const title = localized(form, "title", 60, true, errors);
  const price = parseTaka(field(form, "price"));
  if (price === null) errors.price = "price_invalid";
  const compareText = field(form, "compareAt").trim();
  const compareAt = compareText ? parseTaka(compareText) : undefined;
  if (compareAt === null) errors.compareAt = "price_invalid";
  else if (compareAt !== undefined && price !== null && compareAt <= price) errors.compareAt = "compare_at_not_higher";
  const netText = field(form, "netValue").trim();
  const netValue = netText ? parseDecimal(netText, 100000) : undefined;
  if (netValue === null) errors.netValue = "number_invalid";
  const unit = field(form, "netUnit") as (typeof NET_UNITS)[number];
  if (netValue && !NET_UNITS.includes(unit)) errors.netUnit = "required";
  const barcode = field(form, "barcode").trim() || undefined;
  if (barcode && !/^[0-9A-Za-z-]{1,40}$/.test(barcode)) errors.barcode = "barcode_invalid";
  const weightText = field(form, "weightGrams").trim();
  const weightGrams = weightText ? parseInteger(weightText, 1, 1_000_000) : undefined;
  if (weightGrams === null) errors.weightGrams = "number_invalid";
  const position = parseInteger(field(form, "position") || "0", 0, 1000);
  if (position === null) errors.position = "number_invalid";
  const options: VariantInput["options"] = [];
  for (const line of field(form, "options").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [key = "", bn = "", en = ""] = line.split("|").map((c) => c.trim());
    if (!KEY.test(key) || key.length > 30 || !bn || bn.length > 60 || en.length > 60) errors.options = "option_line";
    else options.push({ key, value: en ? { bn, en } : { bn } });
  }
  if (options.length > 5) errors.options = "too_many";
  const tiers = readTiers(field(form, "tiers"), errors);
  if (Object.keys(errors).length || !title || price === null || position === null) return { errors, values };
  return {
    input: {
      tiers,
      sku,
      title,
      options,
      netQuantity: netValue ? { value: netValue, unit, verified: checked(form, "netVerified") } : undefined,
      price: { amountMinor: price, currency: "BDT" },
      compareAt: compareAt ? { amountMinor: compareAt, currency: "BDT" } : undefined,
      barcode,
      weightGrams: weightGrams ?? undefined,
      position,
    },
    errors,
    values,
  };
}

/** Quantity price breaks, one per line: "5 = 80" (from 5 items, ৳80 each). */
function readTiers(text: string, errors: Record<string, string>) {
  const tiers: { minQty: number; unitPrice: { amountMinor: number; currency: "BDT" } }[] = [];
  for (const raw of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^(\S+)\s*=\s*(\S+)$/.exec(raw);
    const qty = m ? parseInteger(m[1]!, 2, 999) : null;
    const price = m ? parseTaka(m[2]!) : null;
    if (qty === null || price === null) {
      errors.tiers = "tier_line";
      return undefined;
    }
    tiers.push({ minQty: qty, unitPrice: { amountMinor: price, currency: "BDT" } });
  }
  if (tiers.length > 5) errors.tiers = "too_many";
  return tiers.length ? tiers : undefined;
}

// ── Products ────────────────────────────────────────────────────────────────────────────────

export async function createProductAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readProduct(form);
  if (!input) return fail("fix_fields", errors, values);
  let id: string;
  try {
    id = String(await createProduct(ctx.db, ctx.client, ctx.actor, input));
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  afterPublicWrite("product");
  redirect(`/admin/products/${id}?created=1`);
}

export async function updateProductAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readProduct(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await updateProduct(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  afterPublicWrite("product");
  refresh();
  return ok("catalogue_saved");
}

export async function setProductStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const status = field(form, "status");
  if (status !== "draft" && status !== "published" && status !== "archived") return fail("try_again");
  try {
    await setProductStatus(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), status);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  afterPublicWrite("product");
  refresh();
  return ok(`catalogue_status_${status}`);
}

/**
 * Bulk status for the products list (B4 contract: "/admin/products: list, filters, bulk status").
 * Each selected item posts "id:version" as rendered; every product goes through setProductStatus, so
 * the publish rules (published category, priced active variant, sample guard) and the audit entry
 * apply one by one. One failure never hides the others: the result lists what was not changed.
 */
export async function bulkProductStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const status = field(form, "status");
  if (status !== "draft" && status !== "published" && status !== "archived") return fail("try_again");
  // The table (≥1024 px) and the cards both carry a checkbox per product; one id counts once.
  const items = [...new Set(form.getAll("item").map(String))];
  if (items.length === 0) return fail("catalogue_bulk_none");
  if (items.length > BULK_LIMIT) return fail("catalogue_bulk_limit");
  const parsed = items.map((raw) => /^([a-f0-9]{24}):(\d{1,9})$/.exec(raw));
  if (parsed.some((m) => m === null)) return fail("try_again");
  if (new Set(parsed.map((m) => (m as RegExpExecArray)[1])).size !== parsed.length) return fail("try_again");
  let done = 0;
  const failures: { id: string; code: string }[] = [];
  for (const m of parsed as RegExpExecArray[]) {
    const id = m[1] ?? "";
    try {
      await setProductStatus(ctx.db, ctx.client, ctx.actor, id, Number(m[2]), status);
      done += 1;
    } catch (error) {
      failures.push({ id, code: serviceErrorCode(error) });
    }
  }
  afterPublicWrite("product");
  refresh();
  return { status: "success", code: "catalogue_bulk_done", data: { done, total: items.length, failures } };
}

const BULK_LIMIT = 25;

export async function deleteProductAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  if (!checked(form, "confirm")) return fail("fix_fields", { confirm: "confirm_required" });
  try {
    await deleteProduct(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  afterPublicWrite("product");
  redirect("/admin/products?deleted=1");
}

export async function addProductMediaAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const errors: Record<string, string> = {};
  const publicId = field(form, "publicId");
  if (!isOwnPublicId(publicId, "product") || publicId.length > 200) errors.publicId = "media_invalid";
  const alt = localized(form, "alt", 200, true, errors);
  const rights = field(form, "rights").trim();
  if (!rights || rights.length > 300) errors.rights = "required";
  const width = parseInteger(field(form, "width") || "0", 0, 100000);
  const height = parseInteger(field(form, "height") || "0", 0, 100000);
  const values = { altBn: field(form, "altBn"), altEn: field(form, "altEn"), rights };
  if (Object.keys(errors).length || !alt) return fail("fix_fields", errors, values);
  try {
    await addProductMedia(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), { publicId, alt, rights, ...(width ? { width } : {}), ...(height ? { height } : {}) });
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  afterPublicWrite("product");
  refresh();
  return ok("catalogue_media_added");
}

export async function removeProductMediaAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  try {
    await removeProductMedia(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), field(form, "publicId"));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  afterPublicWrite("product");
  refresh();
  return ok("catalogue_media_removed");
}

// ── Variants ────────────────────────────────────────────────────────────────────────────────

export async function createVariantAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readVariant(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await createVariant(ctx.db, ctx.client, ctx.actor, field(form, "productId"), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  afterPublicWrite("product");
  refresh();
  return ok("catalogue_variant_added");
}

export async function updateVariantAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readVariant(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await updateVariant(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  afterPublicWrite("product");
  refresh();
  return ok("catalogue_saved");
}

export async function setVariantStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const status = field(form, "status");
  if (status !== "active" && status !== "archived") return fail("try_again");
  try {
    await setVariantStatus(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), status);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  afterPublicWrite("product");
  refresh();
  return ok(status === "active" ? "catalogue_variant_restored" : "catalogue_variant_archived");
}

// ── Categories ──────────────────────────────────────────────────────────────────────────────

function readCategory(form: FormData) {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const k of ["slug", "nameBn", "nameEn", "descriptionBn", "descriptionEn", "position", "parentId", "seoTitleBn", "seoTitleEn", "seoDescriptionBn", "seoDescriptionEn"]) values[k] = field(form, k);
  const slug = field(form, "slug").trim().toLowerCase();
  if (!SLUG.test(slug) || slug.length < 2 || slug.length > 80) errors.slug = "slug_invalid";
  const name = localized(form, "name", 80, true, errors);
  const description = localized(form, "description", 500, false, errors);
  const position = parseInteger(field(form, "position") || "0", 0, 100000);
  if (position === null) errors.position = "number_invalid";
  const seo = readSeo(form, errors);
  if (Object.keys(errors).length || !name || position === null) return { errors, values } as const;
  return { input: { slug, name, description, position, seo }, errors, values } as const;
}

export async function createCategoryAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readCategory(form);
  if (!input) return fail("fix_fields", errors, values);
  const parentId = field(form, "parentId");
  if (parentId && !ID.test(parentId)) return fail("fix_fields", { parentId: "required" }, values);
  try {
    await createCategory(ctx.db, ctx.client, ctx.actor, { ...input, parentId: parentId || null });
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  afterPublicWrite("category");
  refresh();
  return ok("catalogue_category_created");
}

export async function updateCategoryAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readCategory(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await updateCategory(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  afterPublicWrite("category");
  refresh();
  return ok("catalogue_saved");
}

export async function moveCategoryAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const parentId = field(form, "parentId");
  if (parentId && !ID.test(parentId)) return fail("try_again");
  try {
    await moveCategory(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), parentId || null);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  afterPublicWrite("category");
  refresh();
  return ok("catalogue_category_moved");
}

export async function setCategoryStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const status = field(form, "status");
  if (status !== "draft" && status !== "published" && status !== "archived") return fail("try_again");
  try {
    await setCategoryStatus(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form), status);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  afterPublicWrite("category");
  refresh();
  return ok(`catalogue_status_${status}`);
}

export async function deleteCategoryAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  if (!checked(form, "confirm")) return fail("fix_fields", { confirm: "confirm_required" });
  try {
    await deleteCategory(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  afterPublicWrite("category");
  refresh();
  return ok("catalogue_deleted");
}

// ── Inventory (inventory.adjust: requires two-step verification and a fresh step-up) ─────────

export async function moveStockAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("inventory.adjust");
  if ("error" in ctx) return ctx.error;
  const kind = field(form, "kind");
  const values = { qty: field(form, "qty"), reason: field(form, "reason"), kind };
  const errors: Record<string, string> = {};
  if (kind !== "receive" && kind !== "adjust") errors.kind = "required";
  const qty = parseInteger(field(form, "qty"), kind === "receive" ? 1 : -100000, 100000);
  if (qty === null || qty === 0) errors.qty = kind === "receive" ? "qty_positive" : "qty_nonzero";
  const reason = field(form, "reason").trim();
  if (kind === "adjust" && !reason) errors.reason = "required";
  if (reason.length > 300) errors.reason = "too_long";
  const adjustmentId = field(form, "adjustmentId");
  if (!ADJUSTMENT_ID.test(adjustmentId)) return fail("try_again");
  if (Object.keys(errors).length || qty === null) return fail("fix_fields", errors, values);
  try {
    const result = await moveStock(ctx.db, ctx.client, ctx.actor, { adjustmentId, kind: kind as "receive" | "adjust", reason: reason || undefined, lines: [{ variantId: field(form, "variantId"), qty }] });
    afterPublicWrite("stock");
    refresh();
    return ok(result.replayed ? "inventory_replayed" : kind === "receive" ? "inventory_received" : "inventory_adjusted");
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
}

export async function setThresholdAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("inventory.adjust");
  if ("error" in ctx) return ctx.error;
  const threshold = parseInteger(field(form, "threshold"), 0, 100000);
  if (threshold === null) return fail("fix_fields", { threshold: "number_invalid" }, { threshold: field(form, "threshold") });
  try {
    await setLowStockThreshold(ctx.db, ctx.actor, field(form, "variantId"), threshold);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  afterPublicWrite("stock");
  refresh();
  return ok("inventory_threshold_saved");
}
