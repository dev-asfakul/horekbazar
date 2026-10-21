// Root layout, one per locale ("/" is Bengali through a proxy rewrite, "/en" is English).
// Fonts, tokens, header and the bottom dock arrive in phase B1.
import "../globals.css";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isLocale } from "@/lib/i18n/locales";

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  // Nonce-based CSP requires dynamic rendering (domain-rules §9; D17 option (a) until decided).
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
