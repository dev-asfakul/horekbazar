// /account (B3; noindex; signed-in customers and staff). Links to orders and addresses (B7).
import type { Metadata } from "next";
import Link from "next/link";
import { localeHref } from "@/lib/i18n/href";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { isLocale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/account">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account");
  const t = await getTranslations({ locale, namespace: "account" });
  return (
    <AccountFrame locale={locale} current="overview" title={t("title")} staff={principal.role !== null}>
      <p className="account-meta" data-testid="signed-in-as">
        {t("signedInAs", { email: principal.user.email })}
      </p>
      <section className="account-section" aria-labelledby="orders-title">
        <h2 id="orders-title" className="account-section-title">
          {t("ordersTitle")}
        </h2>
        <p>{t("ordersBody")}</p>
        <Link className="prose-link" href={localeHref(locale, "/account/orders")}>
          {t("ordersLink")}
        </Link>
      </section>
      <section className="account-section" aria-labelledby="addresses-title">
        <h2 id="addresses-title" className="account-section-title">
          {t("addressesTitle")}
        </h2>
        <p>{t("addressesBody")}</p>
        <Link className="prose-link" href={localeHref(locale, "/account/addresses")}>
          {t("addressesLink")}
        </Link>
      </section>
    </AccountFrame>
  );
}
