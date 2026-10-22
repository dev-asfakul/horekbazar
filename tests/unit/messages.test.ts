import { describe, expect, it } from "vitest";
import bn from "@/messages/bn.json";
import en from "@/messages/en.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}
function values(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(values);
}

describe("message catalogues", () => {
  it("Banglish has exactly the English keys, except the English-only admin namespace", () => {
    const storefront = keys(en).filter((k) => !k.startsWith("admin."));
    expect(keys(bn).sort()).toEqual(storefront.sort());
    expect("admin" in bn).toBe(false);
  });

  it("has no empty strings and no em dashes (house copy rule)", () => {
    for (const text of [...values(bn), ...values(en)]) {
      expect(text.trim()).not.toBe("");
      expect(text).not.toContain("\u2014");
    }
  });

  it("states cash on delivery and store confirmation in the footer, in both languages", () => {
    expect(en.shell.footer.payment).toBe("Payment: cash on delivery. Orders are confirmed by the store before dispatch.");
    expect(bn.shell.footer.payment).toContain("ক্যাশ অন ডেলিভারি");
  });
});
