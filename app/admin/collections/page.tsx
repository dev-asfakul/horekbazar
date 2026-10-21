// /admin/collections (B4, merch.write). Manual collections: a named, ordered set of products across
// categories. Rule collections are stored by the schema but evaluated in B5, so only manual ones are
// created here.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { createCollectionAction, deleteCollectionAction, setCollectionStatusAction, updateCollectionAction } from "@/lib/actions/merch";
import { adminPage, count, lt } from "@/lib/admin/page";
import { localizedFields, productFields } from "@/lib/admin/forms";
import { getAdminLocale } from "@/lib/auth/server";
import { PRODUCTS, type ProductDoc } from "@/lib/modules/catalogue/schema";
import { listCollections } from "@/lib/modules/merch/merch";
import type { CollectionDoc } from "@/lib/modules/merch/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.collections" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminCollectionsPage() {
  const { locale, db, messages } = await adminPage("/admin/collections");
  const t = await getTranslations({ locale, namespace: "admin.collections" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof productFields>[0];
  const [collections, products] = await Promise.all([
    listCollections(db),
    db.collection<ProductDoc>(PRODUCTS).find({ status: { $ne: "archived" } }, { projection: { name: 1, slug: 1, status: 1 } }).sort({ "name.bn": 1 }).limit(500).toArray(),
  ]);
  const productOptions = products.map((p) => ({ value: String(p._id), label: `${lt(p.name, locale)}${p.status === "draft" ? ` (${c("statuses.draft")})` : ""}` }));
  const fieldsFor = (col?: CollectionDoc): FieldSpec[] => [
    { name: "slug", label: c("fields.slug"), hint: c("fields.slugHint"), required: true, defaultValue: col?.slug ?? "", maxLength: 80, autoComplete: "off" },
    ...localizedFields(ct, "name", c("fields.name"), col?.name, { required: true, max: 80 }),
    ...localizedFields(ct, "description", c("fields.description"), col?.description, { max: 500, textarea: true }),
    { name: "productIds", label: t("products"), hint: t("productsHint"), type: "multiselect", options: productOptions, defaultValues: col?.productIds.map(String) ?? [], wide: true },
  ];

  return (
    <div className="admin-page" data-testid="admin-collections">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <section className="admin-section" aria-labelledby="list-title">
        <h2 id="list-title" className="admin-section-title">
          {t("listTitle", { count: count(collections.length) })}
        </h2>
        {collections.length === 0 ? (
          <div className="admin-empty" data-testid="collections-empty">
            <p className="admin-empty-title">{t("empty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {collections.map((col) => {
              const hidden = { id: String(col._id), version: String(col.version) };
              return (
                <li key={String(col._id)} className="staff-row" data-slug={col.slug}>
                  <p className="staff-name">{lt(col.name, locale)}</p>
                  <p className="record-chips">
                    <StatusChip tone={col.status} label={c(`statuses.${col.status}`)} />
                    <span className="record-sub" lang="en">
                      {col.slug}
                    </span>
                    <span className="record-sub">{t("productCount", { count: count(col.productIds.length) })}</span>
                    {col.kind === "rule" ? <span className="record-sub">{t("rule")}</span> : null}
                  </p>
                  <details className="staff-manage">
                    <summary>{c("manage")}</summary>
                    <ActionForm
                      action={setCollectionStatusAction}
                      hidden={{ ...hidden, status: col.status === "published" ? "draft" : "published" }}
                      fields={[]}
                      messages={messages}
                      submitLabel={col.status === "published" ? c("unpublish") : c("publish")}
                      pendingLabel={c("saving")}
                      variant={col.status === "published" ? "secondary" : "primary"}
                      layout="inline"
                    />
                    {col.kind === "manual" ? <ActionForm action={updateCollectionAction} layout="grid" hidden={hidden} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={fieldsFor(col)} /> : null}
                    <ActionForm action={deleteCollectionAction} hidden={hidden} messages={messages} submitLabel={c("delete")} pendingLabel={c("saving")} variant="danger" fields={[{ name: "confirm", label: c("deleteConfirm"), type: "checkbox", required: true }]} />
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
        <ActionForm action={createCollectionAction} testId="collection-create-form" layout="grid" messages={messages} submitLabel={t("addSubmit")} pendingLabel={c("saving")} fields={fieldsFor()} />
      </section>
    </div>
  );
}
