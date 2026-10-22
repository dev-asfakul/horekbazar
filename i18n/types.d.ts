// Typed messages: English is the reference catalogue. It alone holds the admin namespace (the admin
// is English only, owner decision 2026-10-22); tests check that bn has every other English key.
import type en from "@/messages/en.json";
import type { Locale } from "@/lib/i18n/locales";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
