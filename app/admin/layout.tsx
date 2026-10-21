// Admin root layout (BUILD-PLAN §2: AdminShell, no storefront dock). Not under [locale]: the admin
// language follows the signed-in staff member's preference (B3), else the store default. Every admin
// page is dynamic, private (frame-ancestors 'none', noindex) and capability-checked on the server.
import "../globals.css";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { preload } from "react-dom";
import { getTranslations } from "next-intl/server";
import { AdminShell, type AdminNavItem } from "@/components/admin/AdminShell";
import { sectionsFor } from "@/lib/admin/sections";
import { preloadedFontByLocale } from "@/config/fonts";
import { freshInstallDefaults } from "@/config/defaults";
import { getAdminLocale, getPrincipal } from "@/lib/auth/server";
import { decideStaffShell } from "@/lib/modules/identity/principal";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#faf7f0" };

export const metadata: Metadata = {
  title: { template: "%s · Admin", default: "Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection(); // nonce CSP on every rendered page (D17 option a)
  const locale = await getAdminLocale();
  preload(preloadedFontByLocale[locale], { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const t = await getTranslations({ locale, namespace: "admin" });
  const principal = await getPrincipal();
  const nav: AdminNavItem[] = [];
  const shell = decideStaffShell(principal).result;
  if (shell === "two_factor_enrolment" || shell === "second_factor") nav.push({ href: "/admin/security", label: t("nav.security") });
  if (principal && shell === "allowed") {
    for (const s of sectionsFor(principal.role?.capabilities)) nav.push({ href: s.href, label: t(`nav.${s.key}`) });
    nav.push({ href: locale === "en" ? "/en" : "/", label: t("nav.store") });
  }
  return (
    <html lang={locale} data-font-preset={freshInstallDefaults.theme.fontPreset}>
      <body>
        <a href="#main" className="skip-link">
          {t("shell.skipToMain")}
        </a>
        <AdminShell label={t("shell.label")} nav={nav} navLabel={t("nav.label")} signOutLabel={t("nav.signOut")} locale={locale}>
          {children}
        </AdminShell>
      </body>
    </html>
  );
}
