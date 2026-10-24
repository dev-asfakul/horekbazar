// Tier: build (BUILD-PLAN §2 AccountShell). Use-when: every /account page. Avoid-when: auth pages (AuthFrame).
// Reduced-motion: no motion. Touch: nav links are 44 px rows.
// Side navigation from 1024 px, a horizontal list above the content on smaller screens. The current
// section is marked with aria-current and a ruled underline, never colour alone.
// Redesign: a sidebar card from 1024 px (who is signed in, then the sections with icons, then sign
// out); on phones one scrolling row of pills. accountSections() is shared with the overview tiles.
// Phase F (owner 2026-10-25): below 1024 px the row of section pills is gone on every account page,
// because it repeated the overview's section tiles. Nested pages show one "Back to your account"
// link instead; the staff admin link and sign-out stay. From 1024 px the sidebar is unchanged.
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { signOutAction } from "@/lib/actions/identity";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getIdentity, getPrincipal } from "@/lib/auth/server";
import { localeHref } from "@/lib/i18n/href";
import { getSettings } from "@/lib/modules/settings/settings";

export type Section = "overview" | "orders" | "messages" | "notifications" | "reviews" | "rewards" | "addresses" | "profile" | "security" | "privacy";

/** B9: reviews and rewards appear only while the store has them on; messages always. */
async function engagementFlags() {
  const identity = await getIdentity();
  if (!identity.ok) return { reviews: false, rewards: false };
  const f = (await getSettings(identity.identity.db)).features;
  return { reviews: f.reviews, rewards: f.rewards === true };
}

const ICONS: Record<Section, IconName> = {
  overview: "user",
  orders: "orders",
  messages: "chat",
  notifications: "bell",
  reviews: "star",
  rewards: "gift",
  addresses: "pin",
  profile: "id",
  security: "shield",
  privacy: "lock",
};

/** The account sections this store has on, in order, with their icons. */
export async function accountSections(): Promise<{ key: Section; href: string; icon: IconName }[]> {
  const flags = await engagementFlags();
  const keys: Section[] = ["overview", "orders", "messages", "notifications", ...(flags.reviews ? (["reviews"] as const) : []), ...(flags.rewards ? (["rewards"] as const) : []), "addresses", "profile", "security", "privacy"];
  return keys.map((key) => ({ key, href: key === "overview" ? "/account" : `/account/${key}`, icon: ICONS[key] }));
}

export async function AccountFrame({ locale, current, title, staff, children }: { locale: "bn" | "en"; current: Section; title: string; staff: boolean; children: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "account" });
  const items = await accountSections();
  const user = (await getPrincipal())?.user;
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="account-page">
      <nav className="account-nav" aria-label={t("nav.label")}>
        {user ? (
          <div className="account-who">
            <span className="account-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="account-who-text">
              <span className="account-who-name">{user.name || user.email}</span>
              {user.name ? <span className="account-who-email">{user.email}</span> : null}
            </span>
          </div>
        ) : null}
        {current !== "overview" ? (
          <Link href={localeHref(locale, "/account")} className="account-back" data-testid="account-back">
            <Icon name="chevron" size={18} className="account-back-icon" />
            {t("nav.back")}
          </Link>
        ) : null}
        <ul>
          {items.map((item) => (
            <li key={item.key} className="account-nav-section">
              <Link href={localeHref(locale, item.href)} className="account-nav-link" aria-current={item.key === current ? "page" : undefined}>
                <Icon name={item.icon} size={20} className="account-nav-icon" />
                <span>{t(`nav.${item.key}`)}</span>
              </Link>
            </li>
          ))}
          {staff ? (
            <li>
              <Link href="/admin" className="account-nav-link">
                <Icon name="store" size={20} className="account-nav-icon" />
                <span>{t("nav.admin")}</span>
              </Link>
            </li>
          ) : null}
        </ul>
        <form action={signOutAction} className="account-signout">
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="btn btn-quiet account-signout-btn">
            <Icon name="logout" size={20} />
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
