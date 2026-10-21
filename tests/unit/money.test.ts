// The store money formatter (DESIGN.md → Typography → Numbers and money).
import { describe, expect, it } from "vitest";
import { formatCount, formatMoney, groupDigits, moneyFormatFor, toBengaliDigits } from "@/lib/format/money";

const bnLakh = { numerals: "bengali", grouping: "south_asian" } as const;
const latinLakh = { numerals: "latin", grouping: "south_asian" } as const;
const latinWestern = { numerals: "latin", grouping: "western" } as const;

describe("formatMoney", () => {
  it("puts ৳ before the number with no space, Bengali digits and lakh grouping (BUILD-PLAN B1 test)", () => {
    expect(formatMoney(12_500_000, bnLakh)).toBe("৳১,২৫,০০০");
    expect(formatMoney(125_000, bnLakh)).toBe("৳১,২৫০");
  });

  it("supports Latin digits with lakh grouping, and western grouping", () => {
    expect(formatMoney(125_000, latinLakh)).toBe("৳1,250");
    expect(formatMoney(12_500_000, latinLakh)).toBe("৳1,25,000");
    expect(formatMoney(1_250_000_000, latinLakh)).toBe("৳1,25,00,000");
    expect(formatMoney(1_250_000_000, latinWestern)).toBe("৳12,500,000");
  });

  it("shows poisha only when not zero", () => {
    expect(formatMoney(12_550, latinLakh)).toBe("৳125.50");
    expect(formatMoney(12_505, bnLakh)).toBe("৳১২৫.০৫");
    expect(formatMoney(12_500, bnLakh)).toBe("৳১২৫");
  });

  it("handles zero, small amounts and negatives (true minus sign)", () => {
    expect(formatMoney(0, bnLakh)).toBe("৳০");
    expect(formatMoney(5, latinLakh)).toBe("৳0.05");
    expect(formatMoney(-6_000, latinLakh)).toBe("\u2212৳60");
  });

  it("rejects non-integer minor units", () => {
    expect(() => formatMoney(12.5, bnLakh)).toThrow();
    expect(() => formatMoney(Number.NaN, bnLakh)).toThrow();
  });
});

describe("helpers", () => {
  it("groups digits", () => {
    expect(groupDigits("999", "south_asian")).toBe("999");
    expect(groupDigits("1000", "south_asian")).toBe("1,000");
    expect(groupDigits("100000", "south_asian")).toBe("1,00,000");
    expect(groupDigits("1000000", "western")).toBe("1,000,000");
    expect(() => groupDigits("-1", "western")).toThrow();
  });

  it("converts digits and counts", () => {
    expect(toBengaliDigits("2026-10")).toBe("২০২৬-১০");
    expect(formatCount(12, bnLakh)).toBe("১২");
    expect(formatCount(100000, latinLakh)).toBe("1,00,000");
  });

  it("always uses Latin digits on /en and keeps the store's numerals on /", () => {
    expect(moneyFormatFor("en", bnLakh).numerals).toBe("latin");
    expect(moneyFormatFor("en", bnLakh).grouping).toBe("south_asian");
    expect(moneyFormatFor("bn", bnLakh).numerals).toBe("bengali");
  });
});
