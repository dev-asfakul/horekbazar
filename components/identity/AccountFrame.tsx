// Tier: build (BUILD-PLAN §2 AccountShell). Use-when: every /account page. Avoid-when: auth pages (AuthFrame).
// Reduced-motion: no motion. Touch: nav links are 44 px rows.
// Side navigation from 1024 px, a horizontal list above the content on smaller screens. The current
// section is marked with aria-current and a ruled underline, never colour alone.
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { signOutAction } from "@/lib/actions/identity";
import { localeHref } from "@/lib/i18n/href";

type Section = "overview" | "profile" | "security";

export async function AccountFrame({ locale, current, title, staff, children }: { locale: "bn" | "en"; current: Section; title: string; staff: boolean; children: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "account" });
  const items: { key: Section; href: string }[] = [
    { key: "overview", href: "/account" },
    { key: "profile", href: "/account/profile" },
    { key: "security", href: "/account/security" },
  ];
  return (
    <div className="account-page">
      <nav className="account-nav" aria-label={t("nav.label")}>
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <Link href={localeHref(locale, item.href)} className="account-nav-link" aria-current={item.key === current ? "page" : undefined}>
                {t(`nav.${item.key}`)}
              </Link>
            </li>
          ))}
          {staff ? (
            <li>
              <Link href="/admin" className="account-nav-link">
                {t("nav.admin")}
              </Link>
            </li>
          ) : null}
        </ul>
        <form action={signOutAction} className="account-signout">
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="btn btn-quiet">
            {t("signOut")}
          </button>
        </form>
      </nav>
      <div className="account-content">
        <h1 className="account-title font-display">{title}</h1>
        {children}
      </div>
    </div>
  );
}
