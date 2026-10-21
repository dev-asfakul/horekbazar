// Storefront routes that are not built yet. A known storefront path (lib/routes.ts) needs the
// database, so it shows the setup-required state; anything else is a 404. Routes built in later
// phases take precedence over this catch-all.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SetupRequired } from "@/components/states/SetupRequired";
import { isLocale } from "@/lib/i18n/locales";
import { isPendingStorefrontPath } from "@/lib/routes";
import { getSetupStatus } from "@/lib/setup/status";

export async function generateMetadata({ params }: PageProps<"/[locale]/[...rest]">): Promise<Metadata> {
  const { locale, rest } = await params;
  if (!isLocale(locale) || !isPendingStorefrontPath(rest)) return {};
  const t = await getTranslations({ locale, namespace: "setup" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function PendingStorefrontPage({ params }: PageProps<"/[locale]/[...rest]">) {
  const { locale, rest } = await params;
  if (!isLocale(locale) || !isPendingStorefrontPath(rest)) notFound();
  return <SetupRequired locale={locale} status={await getSetupStatus(process.env)} />;
}
