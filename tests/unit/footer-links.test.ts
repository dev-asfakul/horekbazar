// Phase F: footer category links (published tree only, deterministic, bounded).
import { describe, expect, it } from "vitest";
import { buildCategoryTree } from "@/lib/modules/storefront/catalogue";
import { FOOTER_CATEGORY_LIMIT, footerCategories } from "@/lib/modules/storefront/footer-links";
import { ObjectId } from "mongodb";

const row = (slug: string, position: number, parent?: ObjectId) => ({ _id: new ObjectId(), slug, name: { bn: slug, en: slug }, parentId: parent ?? null, position });

describe("footerCategories", () => {
  it("takes top-level categories first, then subcategories level by level, up to the limit", () => {
    const rice = row("rice", 0);
    const oil = row("oil", 1);
    const kids = Array.from({ length: 10 }, (_, i) => row(`rice-${i}`, i, rice._id));
    const tree = buildCategoryTree([rice, oil, ...kids]); // categoryRows() sorts by position, then slug
    const picked = footerCategories(tree).map((c) => c.slug);
    expect(picked).toHaveLength(FOOTER_CATEGORY_LIMIT);
    expect(picked.slice(0, 2)).toEqual(["rice", "oil"]);
    expect(picked.slice(2)).toEqual(["rice-0", "rice-1", "rice-2", "rice-3", "rice-4", "rice-5"]);
  });
  it("is the same for the same tree, and empty for an empty store", () => {
    const rows = [row("a", 0), row("b", 1)];
    expect(footerCategories(buildCategoryTree(rows)).map((c) => c.id)).toEqual(footerCategories(buildCategoryTree(rows)).map((c) => c.id));
    expect(footerCategories({ roots: [] })).toEqual([]);
  });
  it("never lists a subcategory whose parent is not published (not in the tree)", () => {
    const hidden = new ObjectId();
    const tree = buildCategoryTree([row("shown", 0), row("orphan", 0, hidden)]);
    expect(footerCategories(tree).map((c) => c.slug)).toEqual(["shown"]);
  });
});
