// /categories (B5): every published category as a department list (top level with its children).
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SetupRequired } from "@/components/states/SetupRequired";
import { localeHref } from "@/lib/i18n/href";
import { categoryPath } from "@/lib/modules/storefront/catalogue";
import { loadStore, shown, shownLang } from "@/lib/storefront/context";
import { localeOf, storeMetadata } from "@/lib/storefront/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/categories">) {
  const locale = localeOf((await params).locale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "store.categories" });
  return storeMetadata(locale, "/categories", t("title"), t("description"));
}

export default async function CategoriesPage({ params }: PageProps<"/[locale]/categories">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store.categories" });
  return (
    <div className="listing" data-testid="categories">
      <header className="listing-head">
        <h1 className="font-display listing-title">{t("title")}</h1>
        <p className="listing-intro">{t("description")}</p>
      </header>
      {store.tree.roots.length === 0 ? (
        <div className="listing-empty" data-testid="categories-empty">
          <p className="listing-empty-title">{t("empty")}</p>
        </div>
      ) : (
        <ul className="dept-list">
          {store.tree.roots.map((root) => (
            <li key={root.id} className="dept">
              <h2 className="dept-title">
                <Link href={localeHref(locale, categoryPath(root))} lang={shownLang(root.name, locale)}>
                  {shown(root.name, locale)}
                </Link>
              </h2>
              {root.children.length > 0 ? (
                <ul className="dept-children">
                  {root.children.map((c) => (
                    <li key={c.id}>
                      <Link href={localeHref(locale, categoryPath(c))} lang={shownLang(c.name, locale)}>
                        {shown(c.name, locale)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
