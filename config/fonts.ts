// Font presets bundled at build (DESIGN.md → Typography → Template presets; domain-rules §8).
// The buyer picks one in settings (B4). Files live in /public/fonts/v1 (OFL, licences beside them).
import type { Locale } from "@/lib/i18n/locales";

export const fontPresets = ["khata", "plain"] as const;
export type FontPreset = (typeof fontPresets)[number];

/**
 * The one font file preloaded per locale: the Latin subset for both, because the "bn" storefront is
 * Latin-script Banglish (owner decision 2026-10-22). The Bengali subset still loads on demand
 * (unicode-range) for Bengali product data and the taka sign.
 */
export const preloadedFontByLocale: Record<Locale, string> = {
  bn: "/fonts/v1/noto-sans-bengali-latin.woff2",
  en: "/fonts/v1/noto-sans-bengali-latin.woff2",
};

export function isFontPreset(value: unknown): value is FontPreset {
  return typeof value === "string" && (fontPresets as readonly string[]).includes(value);
}
