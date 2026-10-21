// Admin root layout (BUILD-PLAN §2: AdminShell, no storefront dock). Not under [locale]: the admin
// language follows the staff preference from B3, and the store default until then. Every admin page
// is dynamic, private (frame-ancestors 'none', noindex) and capability-checked on the server.
import "../globals.css";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { preload } from "react-dom";
import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/admin/AdminShell";
import { preloadedFontByLocale } from "@/config/fonts";
import { freshInstallDefaults } from "@/config/defaults";
import { adminLocale } from "@/lib/i18n/admin";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#faf7f0" };

export const metadata: Metadata = {
  title: { template: "%s · Admin", default: "Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection(); // nonce CSP on every rendered page (D17 option a)
  const locale = adminLocale();
  preload(preloadedFontByLocale[locale], { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const t = await getTranslations({ locale, namespace: "admin.shell" });
  return (
    <html lang={locale} data-font-preset={freshInstallDefaults.theme.fontPreset}>
      <body>
        <a href="#main" className="skip-link">
          {t("skipToMain")}
        </a>
        <AdminShell label={t("label")}>{children}</AdminShell>
      </body>
    </html>
  );
}
