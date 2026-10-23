// /faq (B10). The owner's text is not supplied yet, so the page shows [NEEDS COPY] and asks not to be
// indexed (lib/storefront/info.ts). Bengali is the default locale (/faq), English at /en/faq.
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InfoPage, NeedsCopy } from "@/components/store/InfoPage";
import { SetupRequired } from "@/components/states/SetupRequired";
import { infoMetadata } from "@/lib/storefront/info";
import { loadStore } from "@/lib/storefront/context";
import { localeOf } from "@/lib/storefront/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/faq">) {
  const locale = localeOf((await params).locale);
  return locale ? infoMetadata(locale, "faq", true) : {};
}

export default async function Page({ params }: PageProps<"/[locale]/faq">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store.info" });
  return (
    <InfoPage page="faq" title={t("faq.title")}>
      <NeedsCopy locale={locale} />
    </InfoPage>
  );
}
