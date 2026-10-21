// Font presets bundled at build (DESIGN.md → Typography → Template presets; domain-rules §8).
// The buyer picks one in settings (B4). Files live in /public/fonts/v1 (OFL, licences beside them).
import type { Locale } from "@/lib/i18n/locales";

export const fontPresets = ["khata", "plain"] as const;
export type FontPreset = (typeof fontPresets)[number];

/** The one font file preloaded per locale: the Noto Sans Bengali text subset for that locale's script. */
export const preloadedFontByLocale: Record<Locale, string> = {
  bn: "/fonts/v1/noto-sans-bengali-bengali.woff2",
  en: "/fonts/v1/noto-sans-bengali-latin.woff2",
};

export function isFontPreset(value: unknown): value is FontPreset {
  return typeof value === "string" && (fontPresets as readonly string[]).includes(value);
}
