// /admin/homepage (B4, merch.write). The homepage is an ordered list of sections of six types (hero,
// category tiles, product rail, banner, collection grid, rich text). A section can be published only
// when everything it shows is published (service rule), so the storefront never shows an empty block.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { createHomeSectionAction, deleteHomeSectionAction, setHomeSectionStatusAction, updateHomeSectionAction } from "@/lib/actions/merch";
import { dhakaDateTimeText } from "@/lib/actions/staff-action";
import { adminPage, count, lt } from "@/lib/admin/page";
import { categoryOptions, localizedFields, productFields } from "@/lib/admin/forms";
import { getAdminLocale } from "@/lib/auth/server";
import { listCategories } from "@/lib/modules/catalogue/categories";
import { listBanners, listCollections, listHomeSections } from "@/lib/modules/merch/merch";
import { HOME_SECTION_TYPES, type HomeSectionDoc, type HomeSectionType } from "@/lib/modules/merch/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.homepage" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

type Data = Record<string, unknown> & { title?: { bn: string; en?: string }; subtitle?: { bn: string; en?: string }; ctaLabel?: { bn: string; en?: string }; body?: { bn: string; en?: string }; href?: string };

export default async function AdminHomepagePage() {
  const { locale, db, messages } = await adminPage("/admin/homepage");
  const t = await getTranslations({ locale, namespace: "admin.homepage" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof productFields>[0];
  const [sections, categories, collections, banners] = await Promise.all([listHomeSections(db), listCategories(db), listCollections(db), listBanners(db)]);
  const categoryChoices = categoryOptions(categories, locale).map((o) => ({ value: o.id, label: o.label }));
  const collectionChoices = collections.map((col) => ({ value: String(col._id), label: lt(col.name, locale) }));
  const bannerChoices = banners.map((b) => ({ value: String(b._id), label: `${lt(b.alt, locale)} (${t(`placements.${b.placement}`)})` }));

  const fieldsFor = (type: HomeSectionType, s?: HomeSectionDoc): FieldSpec[] => {
    const d = (s?.data ?? {}) as Data;
    const base: FieldSpec[] = [
      { name: "order", label: t("order"), hint: t("orderHint"), type: "number", inputMode: "numeric", defaultValue: String(s?.order ?? (sections.length + 1) * 10) },
      { name: "visibleFrom", label: c("fields.visibleFrom"), type: "datetime-local", defaultValue: dhakaDateTimeText(s?.visibleFrom) },
      { name: "visibleTo", label: c("fields.visibleTo"), type: "datetime-local", defaultValue: dhakaDateTimeText(s?.visibleTo) },
    ];
    const title = (required: boolean) => localizedFields(ct, "title", t("sectionTitle"), d.title, { required, max: 80 });
    const ids = (key: string) => ((d[key] as unknown[] | undefined) ?? []).map(String);
    switch (type) {
      case "hero":
        return [
          ...title(true),
          ...localizedFields(ct, "subtitle", t("subtitle"), d.subtitle, { max: 160 }),
          ...localizedFields(ct, "ctaLabel", t("ctaLabel"), d.ctaLabel, { max: 30 }),
          { name: "href", label: t("href"), hint: t("hrefHint"), defaultValue: d.href ?? "", maxLength: 300, autoComplete: "off", wide: true },
          ...base,
        ];
      case "categoryTiles":
        return [...title(false), { name: "categoryIds", label: t("categories"), hint: t("categoriesHint"), type: "multiselect", options: categoryChoices, defaultValues: ids("categoryIds"), wide: true }, ...base];
      case "productRail":
        return [...title(true), { name: "collectionId", label: t("collection"), type: "select", options: [{ value: "", label: c("fields.choose") }, ...collectionChoices], defaultValue: d.collectionId ? String(d.collectionId) : "", wide: true }, ...base];
      case "banner":
        return [{ name: "bannerId", label: t("banner"), type: "select", options: [{ value: "", label: c("fields.choose") }, ...bannerChoices], defaultValue: d.bannerId ? String(d.bannerId) : "", wide: true }, ...base];
      case "collectionGrid":
        return [...title(false), { name: "collectionIds", label: t("collections"), hint: t("collectionsHint"), type: "multiselect", options: collectionChoices, defaultValues: ids("collectionIds"), wide: true }, ...base];
      case "richText":
        return [...title(false), ...localizedFields(ct, "body", t("body"), d.body, { required: true, max: 2000, textarea: true }), ...base];
    }
  };

  return (
    <div className="admin-page" data-testid="admin-homepage">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <section className="admin-section" aria-labelledby="list-title">
        <h2 id="list-title" className="admin-section-title">
          {t("listTitle", { count: count(sections.length) })}
        </h2>
        {sections.length === 0 ? (
          <div className="admin-empty" data-testid="homepage-empty">
            <p className="admin-empty-title">{t("empty")}</p>
            <p className="field-hint">{t("emptyHint")}</p>
          </div>
        ) : (
          <ol className="staff-rows">
            {sections.map((s) => {
              const hidden = { id: String(s._id), version: String(s.version), type: s.type };
              const d = s.data as Data;
              return (
                <li key={String(s._id)} className="staff-row" data-type={s.type}>
                  <p className="staff-name">
                    {count(s.order)} · {t(`types.${s.type}`)}
                    {d.title ? <> · {lt(d.title, locale)}</> : null}
                  </p>
                  <p className="record-chips">
                    <StatusChip tone={s.status} label={c(`statuses.${s.status}`)} />
                  </p>
                  <details className="staff-manage">
                    <summary>{c("manage")}</summary>
                    <ActionForm
                      action={setHomeSectionStatusAction}
                      hidden={{ ...hidden, status: s.status === "published" ? "draft" : "published" }}
                      fields={[]}
                      messages={messages}
                      submitLabel={s.status === "published" ? c("unpublish") : c("publish")}
                      pendingLabel={c("saving")}
                      variant={s.status === "published" ? "secondary" : "primary"}
                      layout="inline"
                    />
                    <ActionForm action={updateHomeSectionAction} layout="grid" hidden={hidden} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={fieldsFor(s.type, s)} />
                    <ActionForm action={deleteHomeSectionAction} hidden={hidden} messages={messages} submitLabel={c("delete")} pendingLabel={c("saving")} variant="danger" fields={[{ name: "confirm", label: c("deleteConfirm"), type: "checkbox", required: true }]} />
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section className="admin-section" aria-labelledby="add-title">
        <h2 id="add-title" className="admin-section-title">
          {t("addTitle")}
        </h2>
        {HOME_SECTION_TYPES.map((type) => (
          <details key={type} className="staff-manage add-block">
            <summary>{t(`types.${type}`)}</summary>
            <p className="field-hint">{t(`typeHints.${type}`)}</p>
            <ActionForm action={createHomeSectionAction} testId={`section-create-${type}`} layout="grid" hidden={{ type }} messages={messages} submitLabel={t("addSubmit")} pendingLabel={c("saving")} fields={fieldsFor(type)} />
          </details>
        ))}
      </section>
    </div>
  );
}
