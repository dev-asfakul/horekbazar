// Admin root layout (BUILD-PLAN §2: AdminShell, no storefront dock; restyled per Proposal A1,
// docs/ADMIN-REDESIGN-A1.md). Not under [locale]: the admin is English-only (adminLocale). Every admin
// page is dynamic, private (frame-ancestors 'none', noindex) and capability-checked on the server; the
// navigation below only reflects those checks and never replaces them.
import "../globals.css";
import "../admin.css";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { preload } from "react-dom";
import { getTranslations } from "next-intl/server";
import type { AdminNavGroup } from "@/components/admin/AdminNav";
import { AdminShell, type AdminShellIdentity } from "@/components/admin/AdminShell";
import { NavigationProgress } from "@/components/shell/NavigationProgress";
import { groupSections, sectionsFor, type AdminSectionKey } from "@/lib/admin/sections";
import { countWork, formatWorkCount, WORK_COUNTS, type WorkCountKey } from "@/lib/admin/work-counts";
import { freshInstallDefaults } from "@/config/defaults";
import { getAdminLocale, getIdentity, getPrincipal } from "@/lib/auth/server";
import { decideAccess, decideStaffShell, type Principal } from "@/lib/modules/identity/principal";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f9ef",
};

export const metadata: Metadata = {
  title: { template: "%s · Admin", default: "Admin" },
  robots: { index: false, follow: false },
};

/** Nav badges for the two queues staff check most. Hidden on zero or on any error (never a fake 0). */
const BADGE_SECTIONS: Partial<Record<AdminSectionKey, WorkCountKey>> = {
  orders: "orders",
  messages: "messages",
};

async function navBadges(principal: Principal): Promise<Partial<Record<AdminSectionKey, number>>> {
  const identity = await getIdentity();
  if (!identity.ok) return {};
  const out: Partial<Record<AdminSectionKey, number>> = {};
  await Promise.all(
    (Object.entries(BADGE_SECTIONS) as [AdminSectionKey, WorkCountKey][]).map(async ([section, key]) => {
      const def = WORK_COUNTS.find((d) => d.key === key)!;
      if (decideAccess(principal, def.capability).result !== "allowed") return;
      try {
        out[section] = await countWork(identity.identity.db, def);
      } catch {
        // Leave the badge off; the page itself still loads.
      }
    }),
  );
  return out;
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection(); // nonce CSP on every rendered page (D17 option a)
  const locale = await getAdminLocale();
  preload("/fonts/v1/google-sans-latin.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  const t = await getTranslations({ locale, namespace: "admin" });
  const principal = await getPrincipal();
  const shell = decideStaffShell(principal).result;
  let groups: AdminNavGroup[] = [];
  let identity: AdminShellIdentity | null = null;
  let store: { href: string; label: string } | null = null;
  if (principal && (shell === "two_factor_enrolment" || shell === "second_factor")) {
    // Restricted shell: only Security until the second factor is set up or passed.
    groups = [
      {
        key: "security",
        label: null,
        links: [{ href: "/admin/security", label: t("nav.security"), icon: "shield" }],
      },
    ];
  }
  if (principal && shell === "allowed") {
    const badges = await navBadges(principal);
    groups = [
      {
        key: "home",
        label: null,
        links: [{ href: "/admin", label: t("nav.home"), icon: "home" }],
      },
      ...groupSections(sectionsFor(principal.role?.capabilities)).map(({ group, sections }) => ({
        key: group,
        label: t(`nav.groups.${group}`),
        links: sections.map((s) => {
          const n = badges[s.key];
          return {
            href: s.href,
            label: t(`nav.${s.key}`),
            icon: s.icon,
            ...(n
              ? {
                  badge: formatWorkCount(n),
                  badgeLabel: t("nav.waiting", { count: formatWorkCount(n) }),
                }
              : {}),
          };
        }),
      })),
    ];
    store = { href: locale === "en" ? "/en" : "/", label: t("nav.store") };
  }
  if (principal && groups.length > 0) {
    const role = principal.role;
    identity = {
      name: principal.user.name.trim() || principal.user.email,
      role: role ? (role.name[locale] ?? role.name.bn) : t("shell.label"),
      twoFactor: principal.user.twoFactorEnabled ? t("shell.twoFactorOn") : t("shell.twoFactorOff"),
    };
  }
  return (
    <html lang={locale} data-admin="" data-font-preset={freshInstallDefaults.theme.fontPreset}>
      <body>
        <a href="#main" className="skip-link">
          {t("shell.skipToMain")}
        </a>
        <Suspense fallback={null}>
          <NavigationProgress label="Loading" />
        </Suspense>
        <AdminShell
          label={t("shell.label")}
          groups={groups}
          identity={identity}
          store={store}
          labels={{
            nav: t("nav.label"),
            signOut: t("nav.signOut"),
            openMenu: t("shell.openMenu"),
            closeMenu: t("shell.closeMenu"),
            menu: t("shell.menu"),
            home: t("nav.home"),
          }}
          locale={locale}
        >
          {children}
        </AdminShell>
      </body>
    </html>
  );
}
