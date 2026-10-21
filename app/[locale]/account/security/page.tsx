// /account/security (B3; noindex; customer or staff): two-step verification, password, devices.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { SecurityPanels } from "@/components/identity/SecurityPanels";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { isLocale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/security">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.security" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function SecurityPage({ params }: PageProps<"/[locale]/account/security">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/security");
  const t = await getTranslations({ locale, namespace: "account.security" });
  return (
    <AccountFrame locale={locale} current="security" title={t("title")} staff={principal.role !== null}>
      <SecurityPanels locale={locale} principal={principal} identity={identity.identity} />
    </AccountFrame>
  );
}
