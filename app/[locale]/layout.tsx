// Root layout, one per locale ("/" is Bengali-script Banglish through a proxy rewrite, "/en" is English).
// DOM order: skip link, header, main, footer, bottom dock (DESIGN.md → Layout; BUILD-PLAN §6).
import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { preload } from "react-dom";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { BottomDock } from "@/components/shell/BottomDock";
import { BottomNav } from "@/components/shell/BottomNav";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { freshInstallDefaults } from "@/config/defaults";
import { preloadedFontByLocale } from "@/config/fonts";
import { htmlLang, isLocale } from "@/lib/i18n/locales";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets env(safe-area-inset-*) report the home-indicator inset on iOS (DESIGN.md: checked in the build).
  viewportFit: "cover",
  themeColor: "#faf7f0",
};

export const metadata: Metadata = {
  // No store name exists until settings (B4); pages set their own titles.
  title: { template: "%s", default: "HorekBazar" },
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  // Nonce-based CSP requires dynamic rendering on every page (D17, approved option (a)).
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  // Exactly one preloaded font file per locale: the Noto Sans Bengali subset for the page's script.
  preload(preloadedFontByLocale[locale], { as: "font", type: "font/woff2", crossOrigin: "anonymous" });

  const t = await getTranslations({ locale, namespace: "shell" });
  const messages = await getMessages({ locale });
  // Client components get only the strings they need (BUILD-PLAN §8): the error boundary's.
  const clientMessages = { error: messages.error };
  const settings = freshInstallDefaults; // replaced by the settings document in B4

  return (
    <html lang={htmlLang[locale]} data-font-preset={settings.theme.fontPreset}>
      <body>
        <a href="#main" className="skip-link">
          {t("skipToMain")}
        </a>
        <SiteHeader locale={locale} storeName={null} />
        <main id="main" tabIndex={-1}>
          <NextIntlClientProvider locale={locale} messages={clientMessages} timeZone="Asia/Dhaka">
            {children}
          </NextIntlClientProvider>
        </main>
        <SiteFooter locale={locale} />
        <BottomDock label={t("nav.label")}>
          <BottomNav
            locale={locale}
            label={t("nav.label")}
            labels={{
              home: t("nav.home"),
              categories: t("nav.categories"),
              search: t("nav.search"),
              cart: t("nav.cart"),
              account: t("nav.account"),
            }}
          />
        </BottomDock>
        <div id="live-region" className="sr-only" aria-live="polite" aria-atomic="true" />
      </body>
    </html>
  );
}
