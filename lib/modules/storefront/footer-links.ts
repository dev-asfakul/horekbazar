// Footer shopping links from the catalogue (Phase F, owner 2026-10-25). About two-thirds of the
// footer's shopping links are categories: up to FOOTER_CATEGORY_LIMIT published categories, the
// top-level ones first in the admin's order (position, then slug), then their subcategories in the
// same order, level by level, until the limit is reached. The input is the published-only category
// tree that every page already loads from the public-data cache (D24), so this costs no query, and
// the same tree always gives the same links. The fixed links (new, deals, search, cart; account;
// help and policies) stay as they are.
import type { CategoryTree, StoreCategory } from "@/lib/modules/storefront/catalogue";

export const FOOTER_CATEGORY_LIMIT = 8;

export function footerCategories(tree: Pick<CategoryTree, "roots">, limit = FOOTER_CATEGORY_LIMIT): StoreCategory[] {
  const out: StoreCategory[] = [];
  let level = tree.roots;
  while (level.length > 0 && out.length < limit) {
    for (const c of level) {
      if (out.length >= limit) break;
      out.push(c);
    }
    level = level.flatMap((c) => c.children);
  }
  return out;
}
