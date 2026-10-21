// /admin/products/new (B4, catalogue.write). A new product starts as a draft; variants, images and
// publishing follow on its edit page. The primary category must be a leaf (domain-rules §2).
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { createProductAction } from "@/lib/actions/catalogue";
import { adminPage } from "@/lib/admin/page";
import { categoryOptions, productFields } from "@/lib/admin/forms";
import { getAdminLocale } from "@/lib/auth/server";
import { listCategories } from "@/lib/modules/catalogue/categories";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.products" });
  return { title: t("newTitle"), robots: { index: false, follow: false } };
}

export default async function AdminProductNewPage() {
  const { locale, db, messages } = await adminPage("/admin/products", "/admin/products/new");
  const t = await getTranslations({ locale, namespace: "admin.products" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const options = categoryOptions(await listCategories(db), locale);
  const hasLeaf = options.some((o) => o.leaf);
  return (
    <div className="admin-page" data-testid="admin-product-new">
      <p className="admin-breadcrumb">
        <Link className="prose-link" href="/admin/products">
          {t("title")}
        </Link>
      </p>
      <h1 className="font-display admin-title">{t("newTitle")}</h1>
      <p className="admin-intro">{t("newIntro")}</p>
      {hasLeaf ? (
        <section className="admin-section">
          <ActionForm
            action={createProductAction}
            testId="product-create-form"
            layout="grid"
            messages={messages}
            submitLabel={t("create")}
            pendingLabel={c("saving")}
            fields={productFields(c as unknown as Parameters<typeof productFields>[0], options)}
          />
        </section>
      ) : (
        <div className="admin-empty">
          <p className="admin-empty-title">{t("needCategory")}</p>
          <p className="field-hint">
            <Link className="prose-link" href="/admin/categories">
              {t("needCategoryLink")}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
