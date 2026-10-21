"use server";
// B4 merchandising and settings actions: collections, homepage sections, banners (merch.write),
// general settings (settings.write) and delivery zones (delivery.write). Capability checks run on
// the server in staffContext for every action.
import { refresh } from "next/cache";
import { ObjectId } from "mongodb";
import { isOwnPublicId } from "@/lib/adapters/media/cloudinary";
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
import type { FormState } from "@/lib/actions/form-state";
import { SLUG } from "@/lib/modules/catalogue/schema";
import {
  createBanner,
  createCollection,
  createHomeSection,
  deleteBanner,
  deleteCollection,
  deleteHomeSection,
  setBannerStatus,
  setCollectionStatus,
  setHomeSectionStatus,
  updateBanner,
  updateCollection,
  updateHomeSection,
  type BannerInput,
  type HomeSectionInput,
} from "@/lib/modules/merch/merch";
import { BANNER_PLACEMENTS, HOME_SECTION_TYPES, INTERNAL_PATH, type HomeSectionType } from "@/lib/modules/merch/schema";
import { HEX_COLOUR } from "@/lib/modules/settings/schema";
import { getSettings, removeDeliveryZone, updateGeneralSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";

const ID = /^[a-f0-9]{24}$/;
const snapshot = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, field(form, k)]));

function readWindow(form: FormData, errors: Record<string, string>) {
  const visibleFrom = parseDhakaDateTime(field(form, "visibleFrom"));
  const visibleTo = parseDhakaDateTime(field(form, "visibleTo"));
  if (visibleFrom === null) errors.visibleFrom = "date_invalid";
  if (visibleTo === null) errors.visibleTo = "date_invalid";
  if (visibleFrom && visibleTo && visibleTo <= visibleFrom) errors.visibleTo = "window_order";
  return { visibleFrom: visibleFrom ?? undefined, visibleTo: visibleTo ?? undefined };
}

function readHref(form: FormData, errors: Record<string, string>) {
  const href = field(form, "href").trim();
  if (href && (!INTERNAL_PATH.test(href) || href.length > 300)) errors.href = "internal_path";
  return href || undefined;
}

// ── Collections ─────────────────────────────────────────────────────────────────────────────

function readCollection(form: FormData) {
  const errors: Record<string, string> = {};
  const values = { ...snapshot(form, ["slug", "nameBn", "nameEn", "descriptionBn", "descriptionEn"]), productIds: fields(form, "productIds").join(",") };
  const slug = field(form, "slug").trim().toLowerCase();
  if (!SLUG.test(slug) || slug.length < 2 || slug.length > 80) errors.slug = "slug_invalid";
  const name = localized(form, "name", 80, true, errors);
  const description = localized(form, "description", 500, false, errors);
  const productIds = [...new Set(fields(form, "productIds"))];
  if (productIds.some((id) => !ID.test(id))) errors.productIds = "required";
  if (productIds.length > 200) errors.productIds = "too_many";
  if (Object.keys(errors).length || !name) return { errors, values } as const;
  return { input: { slug, name, description, productIds }, errors, values } as const;
}

export async function createCollectionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readCollection(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await createCollection(ctx.db, ctx.actor, input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("merch_created");
}

export async function updateCollectionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readCollection(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await updateCollection(ctx.db, ctx.actor, field(form, "id"), versionOf(form), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("catalogue_saved");
}

export async function setCollectionStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const status = field(form, "status");
  if (status !== "draft" && status !== "published") return fail("try_again");
  try {
    await setCollectionStatus(ctx.db, ctx.actor, field(form, "id"), versionOf(form), status);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok(`catalogue_status_${status}`);
}

export async function deleteCollectionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  if (!checked(form, "confirm")) return fail("fix_fields", { confirm: "confirm_required" });
  try {
    await deleteCollection(ctx.db, ctx.actor, field(form, "id"), versionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("catalogue_deleted");
}

// ── Banners ─────────────────────────────────────────────────────────────────────────────────

function readBanner(form: FormData) {
  const errors: Record<string, string> = {};
  const values = snapshot(form, ["altBn", "altEn", "rights", "href", "placement", "visibleFrom", "visibleTo", "publicId", "width", "height"]);
  const publicId = field(form, "publicId");
  if (!isOwnPublicId(publicId, "banner") || publicId.length > 200) errors.publicId = "media_invalid";
  const rights = field(form, "rights").trim();
  if (!rights || rights.length > 300) errors.rights = "required";
  const alt = localized(form, "alt", 200, true, errors);
  const placement = field(form, "placement") as (typeof BANNER_PLACEMENTS)[number];
  if (!BANNER_PLACEMENTS.includes(placement)) errors.placement = "required";
  const href = readHref(form, errors);
  const window = readWindow(form, errors);
  const width = parseInteger(field(form, "width") || "0", 0, 100000) || undefined;
  const height = parseInteger(field(form, "height") || "0", 0, 100000) || undefined;
  if (Object.keys(errors).length || !alt) return { errors, values } as const;
  const input: BannerInput = { image: { publicId, rights, ...(width ? { width } : {}), ...(height ? { height } : {}) }, alt, placement, href, ...window };
  return { input, errors, values } as const;
}

export async function createBannerAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readBanner(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await createBanner(ctx.db, ctx.actor, input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("merch_created");
}

export async function updateBannerAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readBanner(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await updateBanner(ctx.db, ctx.actor, field(form, "id"), versionOf(form), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("catalogue_saved");
}

export async function setBannerStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const status = field(form, "status");
  if (status !== "draft" && status !== "published" && status !== "archived") return fail("try_again");
  try {
    await setBannerStatus(ctx.db, ctx.actor, field(form, "id"), versionOf(form), status);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok(`catalogue_status_${status}`);
}

export async function deleteBannerAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  if (!checked(form, "confirm")) return fail("fix_fields", { confirm: "confirm_required" });
  try {
    await deleteBanner(ctx.db, ctx.actor, field(form, "id"), versionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("catalogue_deleted");
}

// ── Homepage sections (six types; `data` built per type, then validated by the service) ─────

const SECTION_KEYS = ["order", "titleBn", "titleEn", "subtitleBn", "subtitleEn", "ctaLabelBn", "ctaLabelEn", "href", "bodyBn", "bodyEn", "collectionId", "bannerId", "visibleFrom", "visibleTo"];

function readSection(form: FormData): { input?: HomeSectionInput; errors: Record<string, string>; values: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values = { ...snapshot(form, SECTION_KEYS), categoryIds: fields(form, "categoryIds").join(","), collectionIds: fields(form, "collectionIds").join(",") };
  const type = field(form, "type") as HomeSectionType;
  if (!HOME_SECTION_TYPES.includes(type)) return { errors: { type: "required" }, values };
  const order = parseInteger(field(form, "order") || "0", 0, 1000);
  if (order === null) errors.order = "number_invalid";
  const window = readWindow(form, errors);
  const ids = (key: string, max: number) => {
    const list = [...new Set(fields(form, key))];
    if (!list.length || list.some((id) => !ID.test(id))) errors[key] = "required";
    if (list.length > max) errors[key] = "too_many";
    return list.filter((id) => ID.test(id)).map((id) => new ObjectId(id));
  };
  const one = (key: string) => {
    const id = field(form, key);
    if (!ID.test(id)) errors[key] = "required";
    return ID.test(id) ? new ObjectId(id) : new ObjectId("000000000000000000000000");
  };
  let data: HomeSectionInput["data"] | undefined;
  switch (type) {
    case "hero": {
      const title = localized(form, "title", 80, true, errors);
      const subtitle = localized(form, "subtitle", 160, false, errors);
      const ctaLabel = localized(form, "ctaLabel", 30, false, errors);
      const href = readHref(form, errors);
      if (ctaLabel && !href) errors.href = "required";
      if (title) data = { title, ...(subtitle ? { subtitle } : {}), ...(ctaLabel ? { ctaLabel } : {}), ...(href ? { href } : {}) };
      break;
    }
    case "categoryTiles": {
      const title = localized(form, "title", 80, false, errors);
      data = { ...(title ? { title } : {}), categoryIds: ids("categoryIds", 12) };
      break;
    }
    case "productRail": {
      const title = localized(form, "title", 80, true, errors);
      const collectionId = one("collectionId");
      if (title) data = { title, collectionId };
      break;
    }
    case "banner":
      data = { bannerId: one("bannerId") };
      break;
    case "collectionGrid": {
      const title = localized(form, "title", 80, false, errors);
      data = { ...(title ? { title } : {}), collectionIds: ids("collectionIds", 8) };
      break;
    }
    case "richText": {
      const title = localized(form, "title", 80, false, errors);
      const body = localized(form, "body", 2000, true, errors);
      if (body) data = { ...(title ? { title } : {}), body };
      break;
    }
  }
  if (Object.keys(errors).length || !data || order === null) return { errors, values };
  // The service validates the data against the union for `type` and checks that references exist.
  return { input: { type, data, order, ...window } as HomeSectionInput, errors, values };
}

export async function createHomeSectionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readSection(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await createHomeSection(ctx.db, ctx.actor, input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("merch_created");
}

export async function updateHomeSectionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const { input, errors, values } = readSection(form);
  if (!input) return fail("fix_fields", errors, values);
  try {
    await updateHomeSection(ctx.db, ctx.actor, field(form, "id"), versionOf(form), input);
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("catalogue_saved");
}

export async function setHomeSectionStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  const status = field(form, "status");
  if (status !== "draft" && status !== "published") return fail("try_again");
  try {
    await setHomeSectionStatus(ctx.db, ctx.actor, field(form, "id"), versionOf(form), status);
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok(`catalogue_status_${status}`);
}

export async function deleteHomeSectionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("merch.write");
  if ("error" in ctx) return ctx.error;
  if (!checked(form, "confirm")) return fail("fix_fields", { confirm: "confirm_required" });
  try {
    await deleteHomeSection(ctx.db, ctx.actor, field(form, "id"), versionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("catalogue_deleted");
}

// ── Settings ────────────────────────────────────────────────────────────────────────────────

export async function updateGeneralSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("settings.write");
  if ("error" in ctx) return ctx.error;
  const errors: Record<string, string> = {};
  const values = snapshot(form, ["nameBn", "nameEn", "phone", "email", "addressBn", "addressEn", "hoursBn", "hoursEn", "fontPreset", "accent", "defaultLocale", "numerals", "grouping", "roundingUnit", "wishlist", "brands", "reviews"]);
  const name = localized(form, "name", 60, true, errors);
  const phone = field(form, "phone").trim();
  if (phone && !/^01[3-9][0-9]{8}$/.test(phone)) errors.phone = "phone_format";
  const email = field(form, "email").trim();
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.email = "email_invalid";
  const address = localized(form, "address", 300, false, errors);
  const hours = localized(form, "hours", 120, false, errors);
  const fontPreset = field(form, "fontPreset");
  if (fontPreset !== "khata" && fontPreset !== "plain") errors.fontPreset = "required";
  const accent = field(form, "accent").trim();
  if (!HEX_COLOUR.test(accent)) errors.accent = "colour_invalid";
  const def = field(form, "defaultLocale");
  const numerals = field(form, "numerals");
  const grouping = field(form, "grouping");
  if (def !== "bn" && def !== "en") errors.defaultLocale = "required";
  if (numerals !== "bengali" && numerals !== "latin") errors.numerals = "required";
  if (grouping !== "south_asian" && grouping !== "western") errors.grouping = "required";
  const roundingUnit = parseInteger(field(form, "roundingUnit"), 1, 10000);
  if (roundingUnit === null) errors.roundingUnit = "number_invalid";
  if (Object.keys(errors).length || !name || roundingUnit === null) return fail("fix_fields", errors, values);
  try {
    await updateGeneralSettings(ctx.db, ctx.actor, versionOf(form), {
      store: { name, contact: { ...(phone ? { phone } : {}), ...(email ? { email } : {}), ...(address ? { address } : {}), ...(hours ? { hours } : {}) } },
      theme: { fontPreset: fontPreset as "khata" | "plain", accent: accent.toUpperCase() },
      locale: { default: def as "bn" | "en", numerals: numerals as "bengali" | "latin", grouping: grouping as "south_asian" | "western" },
      pricing: { roundingUnit },
      features: { wishlist: checked(form, "wishlist"), brands: checked(form, "brands"), reviews: checked(form, "reviews") },
    });
  } catch (error) {
    const code = serviceErrorCode(error);
    const detail = (error as { detail?: { field?: string } }).detail;
    return code === "catalogue_invalid" && detail?.field === "accent" ? fail("fix_fields", { accent: "accent_contrast" }, values) : fail(code, undefined, values);
  }
  refresh();
  return ok("settings_saved");
}

export async function upsertDeliveryZoneAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("delivery.write");
  if ("error" in ctx) return ctx.error;
  const errors: Record<string, string> = {};
  const values = snapshot(form, ["zoneId", "nameBn", "nameEn", "fee", "estimateBn", "estimateEn", "enabled"]);
  const id = field(form, "zoneId").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length < 2 || id.length > 40) errors.zoneId = "slug_invalid";
  const name = localized(form, "name", 60, true, errors);
  const fee = parseTaka(field(form, "fee"));
  if (fee === null) errors.fee = "price_invalid";
  const estimate = localized(form, "estimate", 80, true, errors);
  if (Object.keys(errors).length || !name || !estimate || fee === null) return fail("fix_fields", errors, values);
  // The add form must not silently replace an existing zone that happens to share the id.
  if (field(form, "mode") === "create" && (await getSettings(ctx.db)).delivery.zones.some((z) => z.id === id)) return fail("fix_fields", { zoneId: "zone_taken" }, values);
  try {
    await upsertDeliveryZone(ctx.db, ctx.actor, versionOf(form), { id, name, fee: { amountMinor: fee, currency: "BDT" }, estimate, areas: [], enabled: checked(form, "enabled") });
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("settings_zone_saved");
}

export async function removeDeliveryZoneAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("delivery.write");
  if ("error" in ctx) return ctx.error;
  if (!checked(form, "confirm")) return fail("fix_fields", { confirm: "confirm_required" });
  try {
    await removeDeliveryZone(ctx.db, ctx.actor, versionOf(form), field(form, "zoneId"));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("settings_zone_removed");
}
