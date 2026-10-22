// Admin language: English only (owner decision 2026-10-22). Staff language preferences still pick
// the language of their e-mails; the admin screens themselves are always English.
import type { Locale } from "@/lib/i18n/locales";

export function adminLocale(): Locale {
  return "en";
}
