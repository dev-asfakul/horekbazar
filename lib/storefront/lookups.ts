// Per-request cached lookups shared by a route's layout (which decides 404 before the loading
// boundary streams, so the status code is real) and its page.
import { cache } from "react";
import { loadStore } from "@/lib/storefront/context";
import { cachedCollection, cachedProductPage } from "@/lib/storefront/public-cache";

export const productBySlug = cache(async (slug: string) => {
  const store = await loadStore();
  return store.ready ? cachedProductPage(store.db, store.tree, slug) : null;
});

export const collectionBySlug = cache(async (slug: string) => {
  const store = await loadStore();
  return store.ready ? cachedCollection(store.db, slug) : null;
});
