// /collections (B5): published collections (manual lists and rule collections set up in the admin).
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SetupRequired } from "@/components/states/SetupRequired";
import { localeHref } from "@/lib/i18n/href";
import { listPublishedCollections } from "@/lib/modules/storefront/catalogue";
import { loadStore, shown, shownLang } from "@/lib/storefront/context";
import { localeOf, storeMetadata } from "@/lib/storefront/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/collections">) {
  const locale = localeOf((await params).locale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "store.collections" });
  return storeMetadata(locale, "/collections", t("title"), t("description"));
}

export default async function CollectionsPage({ params }: PageProps<"/[locale]/collections">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store.collections" });
  const list = await listPublishedCollections(store.db);
  return (
    <div className="listing" data-testid="collections">
      <header className="listing-head">
        <h1 className="font-display listing-title">{t("title")}</h1>
        <p className="listing-intro">{t("description")}</p>
      </header>
      {list.length === 0 ? (
        <div className="listing-empty" data-testid="collections-empty">
          <p className="listing-empty-title">{t("empty")}</p>
        </div>
      ) : (
        <ul className="dept-list">
          {list.map((c) => (
            <li key={String(c._id)} className="dept">
              <h2 className="dept-title">
                <Link href={localeHref(locale, `/collections/${c.slug}`)} lang={shownLang(c.name, locale)}>
                  {shown(c.name, locale)}
                </Link>
              </h2>
              {c.description ? (
                <p className="field-hint" lang={shownLang(c.description, locale)}>
                  {shown(c.description, locale)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
