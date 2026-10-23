// Root layout, one per locale ("/" is Bengali-script Banglish through a proxy rewrite, "/en" is English).
// DOM order: skip link, header, main, footer, bottom dock (DESIGN.md → Layout; BUILD-PLAN §6).
import "../globals.css";
import "../store.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { preload } from "react-dom";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { BottomDock } from "@/components/shell/BottomDock";
import { BottomNav } from "@/components/shell/BottomNav";
import { OfflineSupport } from "@/components/shell/OfflineSupport";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { ThemeController } from "@/components/shell/ThemeController";
import { freshInstallDefaults } from "@/config/defaults";
import { preloadedFontByLocale } from "@/config/fonts";
import { htmlLang, isLocale } from "@/lib/i18n/locales";
import { formatCount } from "@/lib/format/money";
import { cartSnapshot } from "@/lib/storefront/cart-snapshot";
import { loadStore, moneyFormat, shown } from "@/lib/storefront/context";
import { THEME_COLOR, themeBootScript } from "@/lib/storefront/theme";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets env(safe-area-inset-*) report the home-indicator inset on iOS (DESIGN.md: checked in the build).
  viewportFit: "cover",
  // The day theme's ground; the theme script and ThemeController update it for the other four.
  themeColor: THEME_COLOR.day,
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
  // The saved store name once the store is set up (cached per request; pages reuse it).
  const store = await loadStore();
  const storeName = store.ready ? shown(store.settings.store.name, locale) || null : null;
  const format = store.ready ? moneyFormat(store, locale) : { numerals: locale === "bn" ? ("bengali" as const) : ("latin" as const), grouping: "south_asian" as const };
  const cartCount = store.ready ? (await cartSnapshot(store.db)).count : 0;
  const cartCountText = formatCount(cartCount, format);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // Exactly one preloaded font file per locale: the Google Sans subset for the page's script.
  preload(preloadedFontByLocale[locale], { as: "font", type: "font/woff2", crossOrigin: "anonymous" });

  const t = await getTranslations({ locale, namespace: "shell" });
  const messages = await getMessages({ locale });
  // Client components get only the strings they need (BUILD-PLAN §8): the error boundary's.
  const clientMessages = { error: messages.error };
  const settings = freshInstallDefaults; // replaced by the settings document in B4

  return (
    // data-theme is set before the first paint by the inline script (time of day or the shopper's
    // choice), so React must not warn that it differs from the server's "day".
    <html lang={htmlLang[locale]} data-font-preset={settings.theme.fontPreset} data-store="" data-theme="day" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          {t("skipToMain")}
        </a>
        <SiteHeader locale={locale} storeName={storeName} cartCount={cartCount} format={format} />
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
              cart: t("nav.cart"),
              account: t("nav.account"),
            }}
            cartCount={cartCount}
            cartCountText={cartCountText}
            cartLabel={t("cartCount", { count: cartCountText })}
          />
        </BottomDock>
        <div id="live-region" className="sr-only" aria-live="polite" aria-atomic="true" />
        <OfflineSupport />
        <ThemeController />
      </body>
    </html>
  );
}
