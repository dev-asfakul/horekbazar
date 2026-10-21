// Typed messages: Bengali is the reference catalogue; tests check that English has the same keys.
import type bn from "@/messages/bn.json";
import type { Locale } from "@/lib/i18n/locales";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof bn;
  }
}
