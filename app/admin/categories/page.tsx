// /admin/categories (B4, catalogue.write). The tree up to three levels; create, edit, move, publish,
// archive and delete. The services enforce depth ≤ 3, no cycles (tree lock), no products on a parent,
// a published parent before publishing a child, and a frozen slug after the first publish.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SampleBadge, StatusChip } from "@/components/admin/RecordBits";
import { ActionForm } from "@/components/forms/ActionForm";
import { createCategoryAction, deleteCategoryAction, moveCategoryAction, setCategoryStatusAction, updateCategoryAction } from "@/lib/actions/catalogue";
import { adminPage, count } from "@/lib/admin/page";
import { categoryOptions, localizedFields, productFields, seoFields } from "@/lib/admin/forms";
import { getAdminLocale } from "@/lib/auth/server";
import { listCategories } from "@/lib/modules/catalogue/categories";
import { PRODUCTS, type CategoryDoc } from "@/lib/modules/catalogue/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.categories" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminCategoriesPage() {
  const { locale, db, messages } = await adminPage("/admin/categories");
  const t = await getTranslations({ locale, namespace: "admin.categories" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof productFields>[0];
  const categories = await listCategories(db);
  const byId = new Map(categories.map((cat) => [String(cat._id), cat]));
  const tree = categoryOptions(categories, locale);
  const counts = new Map(
    (await db.collection(PRODUCTS).aggregate<{ _id: unknown; n: number }>([{ $unwind: "$categoryIds" }, { $group: { _id: "$categoryIds", n: { $sum: 1 } } }]).toArray()).map((r) => [String(r._id), r.n]),
  );
  const parentChoices = (exclude?: string) => [
    { value: "", label: t("topLevel") },
    ...tree.filter((o) => o.depth < 3 && o.id !== exclude && !(exclude && o.label.startsWith(`${tree.find((x) => x.id === exclude)?.label} › `))).map((o) => ({ value: o.id, label: o.label })),
  ];
  const fieldsFor = (cat?: CategoryDoc) => [
    { name: "slug", label: c("fields.slug"), hint: c("fields.slugHint"), required: true, defaultValue: cat?.slug ?? "", maxLength: 80, autoComplete: "off" },
    { name: "position", label: c("fields.position"), type: "number" as const, inputMode: "numeric" as const, defaultValue: String(cat?.position ?? 0) },
    ...localizedFields(ct, "name", c("fields.name"), cat?.name, { required: true, max: 80 }),
    ...localizedFields(ct, "description", c("fields.description"), cat?.description, { max: 500, textarea: true }),
    ...seoFields(ct, cat?.seo),
  ];

  return (
    <div className="admin-page" data-testid="admin-categories">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>

      <section className="admin-section" aria-labelledby="tree-title">
        <h2 id="tree-title" className="admin-section-title">
          {t("treeTitle", { count: count(categories.length) })}
        </h2>
        {tree.length === 0 ? (
          <div className="admin-empty" data-testid="categories-empty">
            <p className="admin-empty-title">{t("empty")}</p>
            <p className="field-hint">{t("emptyHint")}</p>
          </div>
        ) : (
          <ul className="staff-rows category-tree" data-testid="category-rows">
            {tree.map((o) => {
              const cat = byId.get(o.id)!;
              const hidden = { id: o.id, version: String(cat.version) };
              return (
                <li key={o.id} className="staff-row" data-depth={o.depth} data-slug={cat.slug}>
                  <p className="staff-name">{o.label}</p>
                  <p className="record-chips">
                    <StatusChip tone={cat.status} label={c(`statuses.${cat.status}`)} />
                    {cat.sample ? <SampleBadge label={c("sample")} title={c("sampleTitle")} /> : null}
                    <span className="record-sub" lang="en">
                      {cat.slug}
                    </span>
                    <span className="record-sub">{o.leaf ? t("products", { count: count(counts.get(o.id) ?? 0) }) : t("parent")}</span>
                  </p>
                  <details className="staff-manage">
                    <summary>{t("manage")}</summary>
                    <div className="form-actions status-actions">
                      {cat.status !== "published" ? (
                        <ActionForm action={setCategoryStatusAction} hidden={{ ...hidden, status: "published" }} fields={[]} messages={messages} submitLabel={t("publish")} pendingLabel={c("saving")} layout="inline" />
                      ) : (
                        <ActionForm action={setCategoryStatusAction} hidden={{ ...hidden, status: "draft" }} fields={[]} messages={messages} submitLabel={t("unpublish")} pendingLabel={c("saving")} variant="secondary" layout="inline" />
                      )}
                      {cat.status !== "archived" ? (
                        <ActionForm action={setCategoryStatusAction} hidden={{ ...hidden, status: "archived" }} fields={[]} messages={messages} submitLabel={t("archive")} pendingLabel={c("saving")} variant="secondary" layout="inline" />
                      ) : null}
                    </div>
                    <h3 className="auth-section-title">{t("edit")}</h3>
                    {cat.publishedAt ? <p className="field-hint">{t("slugFrozen")}</p> : null}
                    <ActionForm action={updateCategoryAction} layout="grid" hidden={hidden} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={fieldsFor(cat)} />
                    <h3 className="auth-section-title">{t("move")}</h3>
                    <ActionForm
                      action={moveCategoryAction}
                      hidden={hidden}
                      messages={messages}
                      submitLabel={t("moveSubmit")}
                      pendingLabel={c("saving")}
                      variant="secondary"
                      fields={[{ name: "parentId", label: t("newParent"), hint: t("moveHint"), type: "select", defaultValue: cat.parentId ? String(cat.parentId) : "", options: parentChoices(o.id) }]}
                    />
                    {cat.publishedAt ? null : (
                      <>
                        <h3 className="auth-section-title">{t("deleteTitle")}</h3>
                        <ActionForm action={deleteCategoryAction} hidden={hidden} messages={messages} submitLabel={t("delete")} pendingLabel={c("saving")} variant="danger" fields={[{ name: "confirm", label: t("deleteConfirm"), type: "checkbox", required: true }]} />
                      </>
                    )}
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
        <ActionForm
          action={createCategoryAction}
          testId="category-create-form"
          layout="grid"
          messages={messages}
          submitLabel={t("addSubmit")}
          pendingLabel={c("saving")}
          fields={[{ name: "parentId", label: t("parentField"), hint: t("parentHint"), type: "select", defaultValue: "", options: parentChoices(), wide: true }, ...fieldsFor()]}
        />
      </section>
    </div>
  );
}
