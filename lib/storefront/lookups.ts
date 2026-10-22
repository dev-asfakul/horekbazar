// Per-request cached lookups shared by a route's layout (which decides 404 before the loading
// boundary streams, so the status code is real) and its page.
import { cache } from "react";
import { getPublishedCollection, getPublishedProduct } from "@/lib/modules/storefront/catalogue";
import { loadStore } from "@/lib/storefront/context";

export const productBySlug = cache(async (slug: string) => {
  const store = await loadStore();
  return store.ready ? getPublishedProduct(store.db, store.tree, slug) : null;
});

export const collectionBySlug = cache(async (slug: string) => {
  const store = await loadStore();
  return store.ready ? getPublishedCollection(store.db, slug) : null;
});
