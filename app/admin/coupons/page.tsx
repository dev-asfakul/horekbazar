// /admin/coupons (B6, promotions.write). Coupon codes (domain-rules §5.3); usage limits are enforced
// at order placement with a guarded increment.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { createCouponAction, setCouponStatusAction, updateCouponAction } from "@/lib/actions/pricing";
import { dhakaDateTimeText, takaText } from "@/lib/actions/staff-action";
import { localizedFields } from "@/lib/admin/forms";
import { adminPage, count, lt } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { CATEGORIES, PRODUCTS, type CategoryDoc, type ProductDoc } from "@/lib/modules/catalogue/schema";
import { listCoupons } from "@/lib/modules/pricing/admin";
import type { CouponDoc } from "@/lib/modules/pricing/schema";
import { getSettings } from "@/lib/modules/settings/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.coupons" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const taka = (v: number | undefined) => (v === undefined ? "" : takaText(v));

export default async function AdminCouponsPage() {
  const { locale, db, messages } = await adminPage("/admin/coupons");
  const t = await getTranslations({ locale, namespace: "admin.coupons" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof localizedFields>[0];
  const [coupons, categories, products, settings] = await Promise.all([
    listCoupons(db),
    db.collection<CategoryDoc>(CATEGORIES).find({ status: { $ne: "archived" } }, { projection: { name: 1 } }).sort({ "name.bn": 1 }).toArray(),
    db.collection<ProductDoc>(PRODUCTS).find({ status: { $ne: "archived" } }, { projection: { name: 1 } }).sort({ "name.bn": 1 }).limit(500).toArray(),
    getSettings(db),
  ]);
  const categoryOptions = categories.map((x) => ({ value: String(x._id), label: lt(x.name, locale) }));
  const productOptions = products.map((x) => ({ value: String(x._id), label: lt(x.name, locale) }));
  const zoneOptions = settings.delivery.zones.map((z) => ({ value: z.id, label: lt(z.name, locale) }));
  const ids = (list: CouponDoc["eligibility"]["categoryIds"] | undefined) => list?.map(String) ?? [];
  const fieldsFor = (x?: CouponDoc): FieldSpec[] => [
    { name: "code", label: t("code"), hint: t("codeHint"), required: true, defaultValue: x?.code ?? "", maxLength: 30, autoComplete: "off" },
    ...localizedFields(ct, "description", t("description"), x?.description, { max: 160 }),
    { name: "kind", label: t("kind"), type: "select", defaultValue: x?.kind ?? "percent", options: (["percent", "fixed", "free_delivery"] as const).map((k) => ({ value: k, label: t(`kinds.${k}`) })) },
    { name: "value", label: t("value"), hint: t("valueHint"), inputMode: "decimal", defaultValue: x ? (x.kind === "percent" ? String(x.value) : x.kind === "fixed" ? takaText(x.value) : "") : "" },
    { name: "maxDiscount", label: t("maxDiscount"), hint: t("maxDiscountHint"), inputMode: "decimal", defaultValue: taka(x?.maxDiscount) },
    { name: "minSubtotal", label: t("minSubtotal"), inputMode: "decimal", defaultValue: taka(x?.minSubtotal) },
    { name: "maxFee", label: t("maxFee"), hint: t("maxFeeHint"), inputMode: "decimal", defaultValue: taka(x?.maxFee) },
    { name: "usageLimit", label: t("usageLimit"), hint: t("limitHint"), inputMode: "numeric", defaultValue: x?.usageLimit !== undefined ? String(x.usageLimit) : "" },
    { name: "perCustomerLimit", label: t("perCustomerLimit"), hint: t("limitHint"), inputMode: "numeric", defaultValue: x?.perCustomerLimit !== undefined ? String(x.perCustomerLimit) : "" },
    { name: "startsAt", label: t("startsAt"), type: "datetime-local", required: true, defaultValue: dhakaDateTimeText(x?.startsAt ?? new Date()) },
    { name: "endsAt", label: t("endsAt"), type: "datetime-local", defaultValue: dhakaDateTimeText(x?.endsAt) },
    { name: "firstOrderOnly", label: t("firstOrderOnly"), type: "checkbox", defaultValue: x?.eligibility.firstOrderOnly ? "on" : "" },
    { name: "categoryIds", label: t("categories"), hint: t("pickHint"), type: "multiselect", options: categoryOptions, defaultValues: ids(x?.eligibility.categoryIds), wide: true },
    { name: "productIds", label: t("products"), hint: t("pickHint"), type: "multiselect", options: productOptions, defaultValues: ids(x?.eligibility.productIds), wide: true },
    { name: "excludeCategoryIds", label: t("excludeCategories"), hint: t("pickHint"), type: "multiselect", options: categoryOptions, defaultValues: ids(x?.eligibility.excludeCategoryIds), wide: true },
    { name: "excludeProductIds", label: t("excludeProducts"), hint: t("pickHint"), type: "multiselect", options: productOptions, defaultValues: ids(x?.eligibility.excludeProductIds), wide: true },
    { name: "zoneIds", label: t("zones"), hint: t("pickHint"), type: "multiselect", options: zoneOptions, defaultValues: x?.eligibility.zoneIds ?? [], wide: true },
  ];

  return (
    <div className="admin-page" data-testid="admin-coupons">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <section className="admin-section" aria-labelledby="list-title">
        <h2 id="list-title" className="admin-section-title">
          {t("listTitle", { count: count(coupons.length) })}
        </h2>
        {coupons.length === 0 ? (
          <div className="admin-empty" data-testid="coupons-empty">
            <p className="admin-empty-title">{t("empty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {coupons.map((x) => {
              const hidden = { id: String(x._id), version: String(x.version) };
              const statusForm = (status: CouponDoc["status"], label: string, variant: "primary" | "secondary" | "danger") => (
                <ActionForm action={setCouponStatusAction} hidden={{ ...hidden, status }} fields={[]} messages={messages} submitLabel={label} pendingLabel={c("saving")} variant={variant} layout="inline" />
              );
              return (
                <li key={String(x._id)} className="staff-row" data-testid="coupon-row" data-code={x.code}>
                  <p className="staff-name" lang="en">
                    {x.code}
                  </p>
                  <p className="record-chips">
                    <StatusChip tone={x.status === "active" ? "published" : x.status} label={t(`statuses.${x.status}`)} />
                    <span className="record-sub">{t(`kinds.${x.kind}`)}</span>
                    <span className="record-sub">{x.usageLimit !== undefined ? t("usedOf", { used: count(x.used), limit: count(x.usageLimit) }) : t("used", { used: count(x.used) })}</span>
                  </p>
                  <details className="staff-manage">
                    <summary>{c("manage")}</summary>
                    {x.status !== "active" ? statusForm("active", t("activate"), "primary") : statusForm("draft", t("deactivate"), "secondary")}
                    {x.status !== "archived" ? statusForm("archived", t("archive"), "danger") : null}
                    <ActionForm action={updateCouponAction} layout="grid" hidden={hidden} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={fieldsFor(x)} />
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="admin-section" aria-labelledby="add-title">
        <h2 id="add-title" className="admin-section-title">
          {t("addTitle")}
        </h2>
        <ActionForm action={createCouponAction} testId="coupon-create-form" layout="grid" messages={messages} submitLabel={t("addSubmit")} pendingLabel={c("saving")} fields={fieldsFor()} />
      </section>
    </div>
  );
}
