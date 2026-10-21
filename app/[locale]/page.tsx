// Home route. Until the database port exists (B2) and is connected, it shows the setup-required
// state (no fallback data, DESIGN.md §1 conflict 1).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SetupRequired } from "@/components/states/SetupRequired";
import { getSetupStatus } from "@/lib/setup/status";
import { isLocale, type Locale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const lang: Locale = isLocale(locale) ? locale : "bn";
  const t = await getTranslations({ locale: lang, namespace: "setup" });
  // A setup state is not public content, so it is not indexed.
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return <SetupRequired locale={locale} status={getSetupStatus(process.env)} />;
}
