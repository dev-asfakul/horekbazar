// Offline state. The service worker that serves it when the network is down arrives in B10;
// until then it is a normal page that tests and the worker can use. Not indexed.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReloadButton } from "@/components/states/ReloadButton";
import { StatePage } from "@/components/states/StatePage";
import { isLocale, type Locale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/offline">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: (isLocale(locale) ? locale : "bn") as Locale, namespace: "offline" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function OfflinePage({ params }: PageProps<"/[locale]/offline">) {
  const { locale } = await params;
  const t = await getTranslations({ locale: (isLocale(locale) ? locale : "bn") as Locale, namespace: "offline" });
  return (
    <StatePage state="offline" title={t("title")}>
      <p className="state-body">{t("body")}</p>
      <p className="state-actions">
        <ReloadButton label={t("reload")} />
      </p>
    </StatePage>
  );
}
