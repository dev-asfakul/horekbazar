// Admin language. Staff preference arrives with staff accounts (B3); until then the admin uses the
// store's default locale (NEXT_PUBLIC_DEFAULT_LOCALE, Bengali when unset).
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n/locales";

export function adminLocale(env: Record<string, string | undefined> = process.env): Locale {
  const configured = env.NEXT_PUBLIC_DEFAULT_LOCALE?.trim() ?? "";
  return isLocale(configured) ? configured : defaultLocale;
}
