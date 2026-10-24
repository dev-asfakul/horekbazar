// /account (B3; noindex; signed-in customers and staff). Links to orders and addresses (B7).
// Redesign: one tile per account section (icon, name, one line), the same list as the navigation.
import type { Metadata } from "next";
import Link from "next/link";
import { localeHref } from "@/lib/i18n/href";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountFrame, accountSections } from "@/components/identity/AccountFrame";
import { Icon } from "@/components/ui/Icon";
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
  const sections = await accountSections();
  return (
    <AccountFrame locale={locale} current="overview" title={t("title")} staff={principal.role !== null}>
      <p className="account-meta" data-testid="signed-in-as">
        {t("signedInAs", { email: principal.user.email })}
      </p>
      <section className="account-section account-hub" aria-labelledby="hub-title">
        <h2 id="hub-title" className="sr-only">
          {t("sectionsTitle")}
        </h2>
        <ul className="account-tiles" data-testid="account-tiles">
          {sections
            .filter((s) => s.key !== "overview")
            .map((s) => (
              <li key={s.key}>
                <Link className="account-tile" href={localeHref(locale, s.href)}>
                  <span className="account-tile-icon">
                    <Icon name={s.icon} />
                  </span>
                  <span className="account-tile-text">
                    <span className="account-tile-title">{t(`nav.${s.key}`)}</span>
                    <span className="account-tile-hint">{t(`tiles.${s.key as Exclude<typeof s.key, "overview">}`)}</span>
                  </span>
                  <Icon name="chevron" size={18} className="account-tile-go" />
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </AccountFrame>
  );
}
