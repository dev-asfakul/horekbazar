import "server-only";
// Admin-entered internal links (banners, hero) are only shown when they lead somewhere real
// (Proposal 04b): a published category, collection or product, or one of the storefront's own
// pages. A link that does not resolve is dropped and the banner shows without one.
import type { Db } from "mongodb";
import { PRODUCTS } from "@/lib/modules/catalogue/schema";
import { listPublishedCollections, type CategoryTree } from "@/lib/modules/storefront/catalogue";

const PAGES = new Set(["/", "/categories", "/new", "/deals", "/search", "/collections", "/cart", "/account", "/about", "/contact", "/faq", "/delivery-policy", "/return-policy", "/privacy-policy", "/terms"]);

export async function resolvesInternal(db: Db, tree: CategoryTree, href: string | undefined): Promise<boolean> {
  if (!href) return false;
  const path = href.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (PAGES.has(path)) return true;
  const [, kind, ...rest] = path.split("/");
  if (kind === "c" && rest.length > 0) {
    let parent: string | null = null;
    for (const slug of rest) {
      const c = tree.bySlug.get(decodeURIComponent(slug));
      if (!c || c.parentId !== parent) return false;
      parent = c.id;
    }
    return true;
  }
  if (kind === "collections" && rest.length === 1) return (await listPublishedCollections(db)).some((c) => c.slug === decodeURIComponent(rest[0]!));
  if (kind === "p" && rest.length === 1) return (await db.collection(PRODUCTS).countDocuments({ slug: decodeURIComponent(rest[0]!), status: "published" }, { limit: 1 })) > 0;
  return false;
}
