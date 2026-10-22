"use server";
// B6 promotions and coupons (capability promotions.write, checked on the server in staffContext).
import { refresh } from "next/cache";
import type { FormState } from "@/lib/actions/form-state";
import {
  checked,
  fail,
  field,
  fields,
  localized,
  ok,
  parseDhakaDateTime,
  parseInteger,
  parseTaka,
  serviceErrorCode,
  staffContext,
  versionOf,
} from "@/lib/actions/staff-action";
import {
  createCoupon,
  createPromotion,
  setCouponStatus,
  setPromotionStatus,
  updateCoupon,
  updatePromotion,
  type CouponInput,
  type PromotionInput,
} from "@/lib/modules/pricing/admin";

type Values = Record<string, string>;

function window(form: FormData, errors: Record<string, string>) {
  const startsAt = parseDhakaDateTime(field(form, "startsAt"));
  const endsAt = parseDhakaDateTime(field(form, "endsAt"));
  if (!startsAt) errors.startsAt = startsAt === null ? "date_invalid" : "required";
  if (endsAt === null) errors.endsAt = "date_invalid";
  if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = "window_order";
  return { startsAt: startsAt ?? undefined, endsAt: endsAt ?? undefined };
}

/** Percent as a whole number 1–100, or a taka amount (paisa). */
function amount(form: FormData, key: string, percent: boolean, errors: Record<string, string>) {
  const text = field(form, key);
  const value = percent ? parseInteger(text, 1, 100) : parseTaka(text);
  if (value === null || value < 1) errors[key] = percent ? "percent_range" : "price_invalid";
  return value ?? 0;
}

function optionalTaka(form: FormData, key: string, errors: Record<string, string>) {
  const text = field(form, key).trim();
  if (!text) return undefined;
  const v = parseTaka(text);
  if (v === null) errors[key] = "price_invalid";
  return v ?? undefined;
}

function optionalCount(form: FormData, key: string, errors: Record<string, string>) {
  const text = field(form, key).trim();
  if (!text) return undefined;
  const v = parseInteger(text, 1, 1_000_000);
  if (v === null) errors[key] = "number_invalid";
  return v ?? undefined;
}

function readPromotion(form: FormData): { input?: PromotionInput; errors: Record<string, string>; values: Values } {
  const errors: Record<string, string> = {};
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Values;
  const name = localized(form, "name", 80, true, errors);
  const kind = field(form, "kind") === "flash_sale" ? "flash_sale" : "product";
  const type = field(form, "discountType") === "fixed" ? "fixed" : "percent";
  const value = amount(form, "discountValue", type === "percent", errors);
  const scopeType = (["all", "categories", "products"] as const).find((s) => s === field(form, "scopeType")) ?? "all";
  const ids = scopeType === "categories" ? fields(form, "categoryIds") : scopeType === "products" ? fields(form, "productIds") : [];
  if (scopeType !== "all" && ids.length === 0) errors[scopeType === "categories" ? "categoryIds" : "productIds"] = "required";
  const { startsAt, endsAt } = window(form, errors);
  if (kind === "flash_sale" && !endsAt && !errors.endsAt) errors.endsAt = "required";
  const cap = optionalCount(form, "cap", errors);
  if (cap !== undefined && kind !== "flash_sale") errors.cap = "flash_only";
  if (Object.keys(errors).length || !name || !startsAt) return { errors, values };
  return { input: { name, kind, discount: { type, value }, scope: { type: scopeType, ids }, startsAt, endsAt, cap }, errors, values };
}

function readCoupon(form: FormData): { input?: CouponInput; errors: Record<string, string>; values: Values } {
  const errors: Record<string, string> = {};
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Values;
  const code = field(form, "code").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(code)) errors.code = "coupon_code";
  const description = localized(form, "description", 160, false, errors);
  const kind = (["percent", "fixed", "free_delivery"] as const).find((k) => k === field(form, "kind")) ?? "percent";
  const value = kind === "free_delivery" ? 0 : amount(form, "value", kind === "percent", errors);
  const maxDiscount = kind === "percent" ? optionalTaka(form, "maxDiscount", errors) : undefined;
  const maxFee = kind === "free_delivery" ? optionalTaka(form, "maxFee", errors) : undefined;
  const { startsAt, endsAt } = window(form, errors);
  const input = {
    code,
    description,
    kind,
    value,
    maxDiscount,
    minSubtotal: optionalTaka(form, "minSubtotal", errors),
    maxFee,
    usageLimit: optionalCount(form, "usageLimit", errors),
    perCustomerLimit: optionalCount(form, "perCustomerLimit", errors),
    startsAt: startsAt ?? new Date(),
    endsAt,
    firstOrderOnly: checked(form, "firstOrderOnly"),
    categoryIds: fields(form, "categoryIds"),
    productIds: fields(form, "productIds"),
    excludeCategoryIds: fields(form, "excludeCategoryIds"),
    excludeProductIds: fields(form, "excludeProductIds"),
    zoneIds: fields(form, "zoneIds"),
  };
  if (Object.keys(errors).length || !startsAt) return { errors, values };
  return { input, errors, values };
}

export async function createPromotionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("promotions.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readPromotion(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await createPromotion(ctx.db, ctx.actor, input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("merch_created");
}

export async function updatePromotionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("promotions.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readPromotion(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await updatePromotion(ctx.db, ctx.actor, field(form, "id"), versionOf(form), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("catalogue_saved");
}

const STATUSES = ["draft", "active", "archived"] as const;

export async function setPromotionStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("promotions.write");
  if ("error" in ctx) return ctx.error;
  const status = STATUSES.find((s) => s === field(form, "status"));
  if (!status) return fail("try_again");
  try {
    await setPromotionStatus(ctx.db, ctx.actor, field(form, "id"), versionOf(form), status);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("catalogue_saved");
}

export async function createCouponAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("promotions.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readCoupon(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await createCoupon(ctx.db, ctx.actor, input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("merch_created");
}

export async function updateCouponAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("promotions.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readCoupon(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await updateCoupon(ctx.db, ctx.actor, field(form, "id"), versionOf(form), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("catalogue_saved");
}

export async function setCouponStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("promotions.write");
  if ("error" in ctx) return ctx.error;
  const status = STATUSES.find((s) => s === field(form, "status"));
  if (!status) return fail("try_again");
  try {
    await setCouponStatus(ctx.db, ctx.actor, field(form, "id"), versionOf(form), status);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("catalogue_saved");
}
