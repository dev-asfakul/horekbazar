// B4 admin form parsing: prices are entered in taka and stored in paisa; Bengali digits are accepted;
// datetime-local values are Asia/Dhaka wall time; localised text needs Bengali (SCHEMA.md "LT").
import { describe, expect, it } from "vitest";
import { dhakaDateTimeText, localized, parseDecimal, parseDhakaDateTime, parseInteger, parseTaka, takaText } from "@/lib/actions/staff-action";
import { adminPageCapability, adminPageFor } from "@/lib/modules/identity/paths";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("parseTaka", () => {
  it("converts taka to integer paisa", () => {
    expect(parseTaka("120")).toBe(12000);
    expect(parseTaka("120.5")).toBe(12050);
    expect(parseTaka("120.05")).toBe(12005);
    expect(parseTaka("0")).toBe(0);
    expect(parseTaka(" 1,250 ")).toBe(125000);
  });
  it("accepts Bengali digits", () => {
    expect(parseTaka("১২০")).toBe(12000);
    expect(parseTaka("৯৯.৫০")).toBe(9950);
  });
  it("rejects non-prices", () => {
    for (const bad of ["", "-5", "1.234", "abc", "1e3", "12.", ".5", "1234567890"]) expect(parseTaka(bad)).toBeNull();
  });
  it("round-trips through takaText", () => {
    expect(takaText(12000)).toBe("120");
    expect(takaText(12050)).toBe("120.50");
    expect(parseTaka(takaText(9905))).toBe(9905);
  });
});

describe("parseInteger and parseDecimal", () => {
  it("bounds integers", () => {
    expect(parseInteger("5", 0, 10)).toBe(5);
    expect(parseInteger("-3", -10, 10)).toBe(-3);
    expect(parseInteger("১১", 0, 10)).toBeNull();
    expect(parseInteger("২", 0, 10)).toBe(2);
    expect(parseInteger("2.5", 0, 10)).toBeNull();
    expect(parseInteger("", 0, 10)).toBeNull();
  });
  it("accepts positive decimals only", () => {
    expect(parseDecimal("0.5", 100)).toBe(0.5);
    expect(parseDecimal("0", 100)).toBeNull();
    expect(parseDecimal("101", 100)).toBeNull();
    expect(parseDecimal("1.2345", 100)).toBeNull();
  });
});

describe("parseDhakaDateTime", () => {
  it("reads datetime-local as UTC+6", () => {
    expect(parseDhakaDateTime("2026-10-22T09:30")?.toISOString()).toBe("2026-10-22T03:30:00.000Z");
    expect(parseDhakaDateTime("")).toBeUndefined();
    expect(parseDhakaDateTime("22/10/2026")).toBeNull();
    expect(parseDhakaDateTime("2026-13-40T99:99")).toBeNull();
  });
  it("round-trips through dhakaDateTimeText", () => {
    const d = parseDhakaDateTime("2026-01-01T00:05")!;
    expect(dhakaDateTimeText(d)).toBe("2026-01-01T00:05");
    expect(dhakaDateTimeText(undefined)).toBe("");
  });
});

describe("localized", () => {
  it("requires Bengali when English is given or the field is required", () => {
    const errors: Record<string, string> = {};
    expect(localized(form({ nameEn: "Rice" }), "name", 80, false, errors)).toBeUndefined();
    expect(errors).toEqual({ nameBn: "required" });
    const e2: Record<string, string> = {};
    expect(localized(form({}), "name", 80, true, e2)).toBeUndefined();
    expect(e2).toEqual({ nameBn: "required" });
  });
  it("returns the pair, or Bengali alone, and enforces length", () => {
    const errors: Record<string, string> = {};
    expect(localized(form({ nameBn: " চাল ", nameEn: "Rice" }), "name", 80, true, errors)).toEqual({ bn: "চাল", en: "Rice" });
    expect(localized(form({ nameBn: "চাল" }), "name", 80, true, errors)).toEqual({ bn: "চাল" });
    expect(localized(form({}), "name", 80, false, errors)).toBeUndefined();
    expect(errors).toEqual({});
    localized(form({ nameBn: "ক".repeat(5) }), "name", 4, true, errors);
    expect(errors).toEqual({ nameBn: "too_long" });
  });
});

describe("adminPageFor", () => {
  it("matches exact pages and the longest section prefix", () => {
    expect(adminPageFor("/admin/products")).toBe("/admin/products");
    expect(adminPageFor("/admin/products/new")).toBe("/admin/products");
    expect(adminPageFor("/admin/products/66f0c0ffee/")).toBe("/admin/products");
    expect(adminPageFor("/admin/settings/delivery")).toBe("/admin/settings/delivery");
    expect(adminPageFor("/admin/settings/delivery/x")).toBe("/admin/settings/delivery");
    expect(adminPageFor("/admin/settings?tab=1")).toBe("/admin/settings");
    expect(adminPageFor("/admin")).toBe("/admin");
  });
  it("does not treat look-alike paths as a section", () => {
    expect(adminPageFor("/admin/productsx")).toBeNull();
    expect(adminPageFor("/admin/unknown")).toBeNull();
    expect(adminPageFor(null)).toBeNull();
  });
  it("maps sections to their capability", () => {
    expect(adminPageCapability("/admin/products/new")).toBe("catalogue.write");
    expect(adminPageCapability("/admin/inventory")).toBe("inventory.adjust");
    expect(adminPageCapability("/admin/banners")).toBe("merch.write");
    expect(adminPageCapability("/admin/settings")).toBe("settings.write");
    expect(adminPageCapability("/admin/settings/delivery")).toBe("delivery.write");
  });
});
