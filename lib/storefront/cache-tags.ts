// Tier: build. Phase A (BUILD-PLAN D24–D26, docs/CACHE-INVENTORY.md): the public-data cache tags and
// which admin writes clear which tags. Pure data: imported by the cache, the invalidation helper and tests.

export const PUBLIC_TAGS = {
  setup: "hb:setup",
  settings: "hb:settings",
  categories: "hb:categories",
  home: "hb:home",
  banners: "hb:banners",
  collections: "hb:collections",
  catalogue: "hb:catalogue",
} as const;
export type PublicTag = (typeof PUBLIC_TAGS)[keyof typeof PUBLIC_TAGS];

/** A kind of successful admin write to public data. */
export type PublicWrite = "product" | "category" | "stock" | "collection" | "banner" | "homeSection" | "settings";

export const TAGS_FOR_WRITE: Record<PublicWrite, readonly PublicTag[]> = {
  product: [PUBLIC_TAGS.catalogue],
  category: [PUBLIC_TAGS.categories, PUBLIC_TAGS.catalogue],
  stock: [PUBLIC_TAGS.catalogue],
  collection: [PUBLIC_TAGS.collections],
  banner: [PUBLIC_TAGS.banners],
  homeSection: [PUBLIC_TAGS.home],
  settings: [PUBLIC_TAGS.settings, PUBLIC_TAGS.setup],
};

/** Writes that change what the in-process search index holds (product names, categories, publish state). */
export const SEARCH_INDEX_WRITES: ReadonlySet<PublicWrite> = new Set(["product", "category"]);

export function tagsFor(writes: readonly PublicWrite[]): PublicTag[] {
  return [...new Set(writes.flatMap((w) => TAGS_FOR_WRITE[w]))];
}
