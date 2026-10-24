// One guest-order lookup per request, shared by the layout (404 decision) and the page.
import { cache } from "react";
import { findGuestOrder } from "@/lib/modules/orders/guest";
import { loadStore } from "@/lib/storefront/context";

export const guestOrderLookup = cache(async (token: string) => {
  const store = await loadStore();
  return store.ready ? findGuestOrder(store.db, token) : null;
});
