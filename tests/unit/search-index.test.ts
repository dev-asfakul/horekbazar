// Redesign search (docs/REDESIGN-BUILD-PLAN.md §5): Banglish and typo tolerant matching, measured
// against the 60 hand-written queries used at Checkpoint 4 (tests/fixtures/search-queries.json:
// Bengali, English, Banglish and misspelt). The queries were written by us, not taken from real
// shoppers; they show the method works on this catalogue, not how real searches will go.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIndex, editDistance, fold, matchIndex, romanise, tokens } from "@/lib/modules/storefront/search-index";

type P = { slug: string; name: { bn: string; en: string }; shortDescription: { bn: string; en: string } };
const products = (JSON.parse(readFileSync("catalogue/horekbazar/products.json", "utf8")) as { products: P[] }).products;
const queries = JSON.parse(readFileSync("tests/fixtures/search-queries.json", "utf8")) as [string, string, string[]][];
const index = buildIndex(products.map((p) => ({ id: p.slug, slug: p.slug, names: [p.name.bn, p.name.en], categoryNames: [p.shortDescription.bn, p.shortDescription.en] })));

describe("romanise and fold", () => {
  it("brings Bengali, Banglish and English spellings to one key", () => {
    expect(fold("চাল")).toBe(fold("chal"));
    expect(fold("তেল")).toBe(fold("tel"));
    expect(fold("সাবান")).toBe(fold("saban"));
    expect(fold("ডাল")).toBe(fold("dal"));
    expect(romanise("মসুর")).toBe("mosur");
  });
  it("splits on spaces, dashes and the Bengali full stop", () => {
    expect(tokens("মিনিকেট চাল-৫ কেজি।")).toEqual(["মিনিকেট", "চাল", "৫", "কেজি"]);
  });
  it("edit distance gives up past the cap", () => {
    expect(editDistance("sabun", "saban", 1)).toBe(1);
    expect(editDistance("abcdef", "uvwxyz", 2)).toBe(3);
  });
});

describe("matchIndex on the 60 test queries", () => {
  const hits = queries.filter(([, q, expected]) => matchIndex(index, q, 3).some((id) => expected.includes(id)));
  it("finds an expected product in the top three for at least 55 of 60", () => {
    expect(hits.length).toBeGreaterThanOrEqual(55);
  });
  it("needs every query word to match", () => {
    expect(matchIndex(index, "chal zzqqxx")).toEqual([]);
  });
  it("returns nothing for an empty query", () => {
    expect(matchIndex(index, "   ")).toEqual([]);
  });
});
