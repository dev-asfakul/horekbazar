// Field lists for the B4 admin forms, shared by the create and edit pages so both post the same
// names to the server actions in lib/actions/catalogue.ts and lib/actions/merch.ts.
import type { FieldSpec } from "@/components/forms/ActionForm";
import { takaText } from "@/lib/actions/staff-action";
import type { CategoryDoc, ProductDoc, VariantDoc } from "@/lib/modules/catalogue/schema";
import { NET_UNITS } from "@/lib/modules/catalogue/schema";

type T = (key: string, values?: Record<string, string>) => string;
type LT = { bn: string; en?: string | undefined } | undefined;

/** Bengali and English inputs for one localised field (Bengali first; English optional). */
export function localizedFields(t: T, name: string, label: string, value: LT, opts: { required?: boolean; textarea?: boolean; max: number; hint?: string }): FieldSpec[] {
  const type = opts.textarea ? "textarea" : "text";
  return [
    { name: `${name}Bn`, label: t("fields.inBengali", { label }), type, required: opts.required ?? false, defaultValue: value?.bn ?? "", maxLength: opts.max, ...(opts.hint ? { hint: opts.hint } : {}) },
    { name: `${name}En`, label: t("fields.inEnglish", { label }), type, defaultValue: value?.en ?? "", maxLength: opts.max },
  ];
}

export function seoFields(t: T, seo: { title?: LT; description?: LT } | undefined): FieldSpec[] {
  return [
    ...localizedFields(t, "seoTitle", t("fields.seoTitle"), seo?.title, { max: 70 }),
    ...localizedFields(t, "seoDescription", t("fields.seoDescription"), seo?.description, { max: 170, textarea: true }),
  ];
}

export interface CategoryOption {
  id: string;
  label: string;
  depth: number;
  leaf: boolean;
  status: CategoryDoc["status"];
}

/** Categories in tree order with their path as the label ("Kitchen › Cookware › Pots"). */
export function categoryOptions(categories: CategoryDoc[], locale: "bn" | "en"): CategoryOption[] {
  const byParent = new Map<string, CategoryDoc[]>();
  for (const c of categories) {
    const key = c.parentId ? String(c.parentId) : "";
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug));
  const out: CategoryOption[] = [];
  const walk = (parent: string, path: string[], depth: number) => {
    for (const c of byParent.get(parent) ?? []) {
      const name = locale === "en" && c.name.en ? c.name.en : c.name.bn;
      const id = String(c._id);
      out.push({ id, label: [...path, name].join(" › "), depth, leaf: !byParent.has(id), status: c.status });
      if (depth < 3) walk(id, [...path, name], depth + 1);
    }
  };
  walk("", [], 1);
  return out;
}

export function attributesText(attributes: ProductDoc["attributes"]): string {
  return attributes.map((a) => [a.key, a.label.bn, a.value.bn, a.label.en ?? "", a.value.en ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
}

export function productFields(t: T, categories: CategoryOption[], product?: ProductDoc): FieldSpec[] {
  const leaves = categories.filter((c) => c.leaf);
  return [
    { name: "slug", label: t("fields.slug"), hint: t("fields.slugHint"), required: true, defaultValue: product?.slug ?? "", maxLength: 80, autoComplete: "off" },
    ...localizedFields(t, "name", t("fields.name"), product?.name, { required: true, max: 120 }),
    {
      name: "primaryCategoryId",
      label: t("fields.primaryCategory"),
      hint: t("fields.primaryCategoryHint"),
      type: "select",
      required: true,
      defaultValue: product ? String(product.primaryCategoryId) : "",
      options: [{ value: "", label: t("fields.choose") }, ...leaves.map((c) => ({ value: c.id, label: c.label }))],
      wide: true,
    },
    {
      name: "categoryIds",
      label: t("fields.alsoIn"),
      hint: t("fields.alsoInHint"),
      type: "multiselect",
      defaultValues: product ? product.categoryIds.map(String).filter((id) => id !== String(product.primaryCategoryId)) : [],
      options: categories.map((c) => ({ value: c.id, label: c.label })),
      wide: true,
    },
    ...localizedFields(t, "shortDescription", t("fields.shortDescription"), product?.shortDescription, { max: 300, textarea: true }),
    ...localizedFields(t, "description", t("fields.description"), product?.description, { max: 5000, textarea: true }),
    { name: "attributes", label: t("fields.attributes"), hint: t("fields.attributesHint"), type: "textarea", rows: 5, defaultValue: product ? attributesText(product.attributes) : "", wide: true },
    ...seoFields(t, product?.seo),
  ];
}

export function variantFields(t: T, variant?: VariantDoc): FieldSpec[] {
  return [
    { name: "sku", label: t("fields.sku"), hint: t("fields.skuHint"), required: true, defaultValue: variant?.sku ?? "", maxLength: 64, autoComplete: "off" },
    { name: "position", label: t("fields.position"), type: "number", inputMode: "numeric", defaultValue: String(variant?.position ?? 0) },
    ...localizedFields(t, "title", t("fields.variantTitle"), variant?.title, { required: true, max: 60, hint: t("fields.variantTitleHint") }),
    { name: "price", label: t("fields.price"), hint: t("fields.priceHint"), type: "number", required: true, defaultValue: variant ? takaText(variant.price.amountMinor) : "" },
    { name: "compareAt", label: t("fields.compareAt"), hint: t("fields.compareAtHint"), type: "number", defaultValue: variant?.compareAt ? takaText(variant.compareAt.amountMinor) : "" },
    { name: "netValue", label: t("fields.netValue"), type: "number", defaultValue: variant?.netQuantity ? String(variant.netQuantity.value) : "" },
    { name: "netUnit", label: t("fields.netUnit"), type: "select", defaultValue: variant?.netQuantity?.unit ?? "kg", options: NET_UNITS.map((u) => ({ value: u, label: t(`units.${u}`) })) },
    { name: "netVerified", label: t("fields.netVerified"), hint: t("fields.netVerifiedHint"), type: "checkbox", defaultValue: variant?.netQuantity?.verified ? "on" : "", wide: true },
    { name: "weightGrams", label: t("fields.weightGrams"), hint: t("fields.weightHint"), type: "number", inputMode: "numeric", defaultValue: variant?.weightGrams ? String(variant.weightGrams) : "" },
    { name: "barcode", label: t("fields.barcode"), defaultValue: variant?.barcode ?? "", maxLength: 40, autoComplete: "off" },
    {
      name: "options",
      label: t("fields.options"),
      hint: t("fields.optionsHint"),
      type: "textarea",
      rows: 2,
      defaultValue: variant ? variant.options.map((o) => [o.key, o.value.bn, o.value.en ?? ""].join(" | ").replace(/ \| $/, "")).join("\n") : "",
      wide: true,
    },
  ];
}
