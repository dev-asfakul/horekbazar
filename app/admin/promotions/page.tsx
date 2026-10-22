// /admin/promotions (B6, promotions.write). Sale prices and flash sales (domain-rules §5.2, §5.6).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { createPromotionAction, setPromotionStatusAction, updatePromotionAction } from "@/lib/actions/pricing";
import { dhakaDateTimeText, takaText } from "@/lib/actions/staff-action";
import { localizedFields } from "@/lib/admin/forms";
import { adminPage, count, lt } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { CATEGORIES, PRODUCTS, type CategoryDoc, type ProductDoc } from "@/lib/modules/catalogue/schema";
import { listPromotions } from "@/lib/modules/pricing/admin";
import type { PromotionDoc } from "@/lib/modules/pricing/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.promotions" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const when = (d: Date | undefined) => (d ? dhakaDateTimeText(d).replace("T", " ") : "");

export default async function AdminPromotionsPage() {
  const { locale, db, messages } = await adminPage("/admin/promotions");
  const t = await getTranslations({ locale, namespace: "admin.promotions" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof localizedFields>[0];
  const [promotions, categories, products] = await Promise.all([
    listPromotions(db),
    db.collection<CategoryDoc>(CATEGORIES).find({ status: { $ne: "archived" } }, { projection: { name: 1 } }).sort({ "name.bn": 1 }).toArray(),
    db.collection<ProductDoc>(PRODUCTS).find({ status: { $ne: "archived" } }, { projection: { name: 1 } }).sort({ "name.bn": 1 }).limit(500).toArray(),
  ]);
  const categoryOptions = categories.map((x) => ({ value: String(x._id), label: lt(x.name, locale) }));
  const productOptions = products.map((x) => ({ value: String(x._id), label: lt(x.name, locale) }));
  const fieldsFor = (p?: PromotionDoc): FieldSpec[] => [
    ...localizedFields(ct, "name", c("fields.name"), p?.name, { required: true, max: 80 }),
    { name: "kind", label: t("kind"), type: "select", defaultValue: p?.kind ?? "product", options: (["product", "flash_sale"] as const).map((k) => ({ value: k, label: t(`kinds.${k}`) })) },
    { name: "discountType", label: t("discountType"), type: "select", defaultValue: p?.discount.type ?? "percent", options: (["percent", "fixed"] as const).map((k) => ({ value: k, label: t(`discountTypes.${k}`) })) },
    { name: "discountValue", label: t("discountValue"), hint: t("discountValueHint"), required: true, inputMode: "decimal", defaultValue: p ? (p.discount.type === "percent" ? String(p.discount.value) : takaText(p.discount.value)) : "" },
    { name: "scopeType", label: t("scopeType"), type: "select", defaultValue: p?.scope.type === "variants" ? "products" : (p?.scope.type ?? "all"), options: (["all", "categories", "products"] as const).map((k) => ({ value: k, label: t(`scopes.${k}`) })) },
    { name: "categoryIds", label: t("categories"), hint: t("pickHint"), type: "multiselect", options: categoryOptions, defaultValues: p?.scope.type === "categories" ? p.scope.ids.map(String) : [], wide: true },
    { name: "productIds", label: t("products"), hint: t("pickHint"), type: "multiselect", options: productOptions, defaultValues: p?.scope.type === "products" ? p.scope.ids.map(String) : [], wide: true },
    { name: "startsAt", label: t("startsAt"), type: "datetime-local", required: true, defaultValue: dhakaDateTimeText(p?.startsAt ?? new Date()) },
    { name: "endsAt", label: t("endsAt"), hint: t("endsAtHint"), type: "datetime-local", defaultValue: dhakaDateTimeText(p?.endsAt) },
    { name: "cap", label: t("cap"), hint: t("capHint"), inputMode: "numeric", defaultValue: p?.cap !== undefined ? String(p.cap) : "" },
  ];

  return (
    <div className="admin-page" data-testid="admin-promotions">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <section className="admin-section" aria-labelledby="list-title">
        <h2 id="list-title" className="admin-section-title">
          {t("listTitle", { count: count(promotions.length) })}
        </h2>
        {promotions.length === 0 ? (
          <div className="admin-empty" data-testid="promotions-empty">
            <p className="admin-empty-title">{t("empty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {promotions.map((p) => {
              const hidden = { id: String(p._id), version: String(p.version) };
              const statusForm = (status: PromotionDoc["status"], label: string, variant: "primary" | "secondary" | "danger") => (
                <ActionForm action={setPromotionStatusAction} hidden={{ ...hidden, status }} fields={[]} messages={messages} submitLabel={label} pendingLabel={c("saving")} variant={variant} layout="inline" />
              );
              return (
                <li key={String(p._id)} className="staff-row" data-testid="promotion-row">
                  <p className="staff-name">{lt(p.name, locale)}</p>
                  <p className="record-chips">
                    <StatusChip tone={p.status === "active" ? "published" : p.status} label={t(`statuses.${p.status}`)} />
                    <span className="record-sub">{t(`kinds.${p.kind}`)}</span>
                    <span className="record-sub">{p.discount.type === "percent" ? t("off", { value: p.discount.value }) : t("offTaka", { value: takaText(p.discount.value) })}</span>
                    <span className="record-sub">{t("window", { start: when(p.startsAt), end: p.endsAt ? when(p.endsAt) : t("noEnd") })}</span>
                    {p.kind === "flash_sale" ? <span className="record-sub">{t("sold", { sold: count(p.sold) })}{p.cap !== undefined ? ` / ${count(p.cap)}` : ""}</span> : null}
                  </p>
                  <details className="staff-manage">
                    <summary>{c("manage")}</summary>
                    {p.status !== "active" ? statusForm("active", t("activate"), "primary") : statusForm("draft", t("deactivate"), "secondary")}
                    {p.status !== "archived" ? statusForm("archived", t("archive"), "danger") : null}
                    <ActionForm action={updatePromotionAction} layout="grid" hidden={hidden} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={fieldsFor(p)} />
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
        <ActionForm action={createPromotionAction} testId="promotion-create-form" layout="grid" messages={messages} submitLabel={t("addSubmit")} pendingLabel={c("saving")} fields={fieldsFor()} />
      </section>
    </div>
  );
}
