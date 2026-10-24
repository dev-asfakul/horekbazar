// Time-of-day themes (Proposal 04): fixed clock boundaries 05, 11, 17, 20, 00 (local time).
import { describe, expect, it } from "vitest";
import { msToNextBoundary, resolveTheme, THEME_COLOR, themeBootScript, themeForHour, THEMES } from "@/lib/storefront/theme";

describe("themeForHour", () => {
  it("maps every hour to the agreed theme", () => {
    const got = Array.from({ length: 24 }, (_, h) => themeForHour(h));
    expect(got.slice(0, 5).every((t) => t === "midnight")).toBe(true);
    expect(got.slice(5, 11).every((t) => t === "morning")).toBe(true);
    expect(got.slice(11, 17).every((t) => t === "day")).toBe(true);
    expect(got.slice(17, 20).every((t) => t === "evening")).toBe(true);
    expect(got.slice(20, 24).every((t) => t === "night")).toBe(true);
  });
  it("a pinned choice wins over the clock", () => {
    expect(resolveTheme("light", 23)).toBe("day");
    expect(resolveTheme("dark", 12)).toBe("night");
    expect(resolveTheme("auto", 18)).toBe("evening");
  });
});

describe("msToNextBoundary", () => {
  it("counts to the next boundary, crossing midnight", () => {
    expect(msToNextBoundary(new Date(2026, 9, 23, 10, 30, 0))).toBe(30 * 60_000);
    expect(msToNextBoundary(new Date(2026, 9, 23, 23, 0, 0))).toBe(60 * 60_000);
    expect(msToNextBoundary(new Date(2026, 9, 23, 4, 59, 59, 999))).toBe(1000);
  });
});

describe("boot script", () => {
  it("has a colour for every theme and mirrors themeForHour", () => {
    for (const t of THEMES) expect(THEME_COLOR[t]).toMatch(/^#[0-9A-F]{6}$/i);
    for (let h = 0; h < 24; h++) {
      const attrs: Record<string, string> = {};
      const doc = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) }, querySelector: () => null };
      const RealDate = Date;
      class FakeDate extends RealDate {
        override getHours() {
          return h;
        }
      }
      new Function("document", "localStorage", "Date", themeBootScript)(doc, { getItem: () => null }, FakeDate);
      expect(attrs["data-theme"]).toBe(themeForHour(h));
    }
  });
});
