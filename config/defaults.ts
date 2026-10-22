// Fresh-install defaults (domain-rules §8: "default values for a fresh install" live in config/).
// They apply until the settings document exists (B4). Nothing here is store data: no name,
// contact, prices or delivery fees are invented.
import type { FontPreset } from "@/config/fonts";
import type { MoneyFormat } from "@/lib/format/money";

export interface ThemeAndLocaleSettings {
  theme: { fontPreset: FontPreset };
  locale: { numerals: MoneyFormat["numerals"]; grouping: MoneyFormat["grouping"] };
}

/** SCHEMA.md → Settings: `theme.fontPreset` (DESIGN.md: "plain" is the template default with the lightest
 *  load; HorekBazar's own store selects "khata" in settings), `locale.numerals` default `bengali` on "/",
 *  `locale.grouping` default `south_asian`. */
export const freshInstallDefaults: ThemeAndLocaleSettings = {
  theme: { fontPreset: "plain" },
  locale: { numerals: "bengali", grouping: "south_asian" },
};
