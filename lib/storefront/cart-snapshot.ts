import "server-only";
// The visitor's cart as the server stores it, read once per request: the item count for the badge
// and the quantity per variant for the product cards' steppers. Read-only; prices and stock are
// never taken from here or from the browser.
import { cache } from "react";
import type { Db } from "mongodb";
import { activeCart } from "@/lib/modules/pricing/cart";
import { cartOwner } from "@/lib/storefront/cart-owner";

export interface CartSnapshot {
  count: number;
  quantities: Map<string, number>;
}

export const cartSnapshot = cache(async (db: Db): Promise<CartSnapshot> => {
  try {
    const owner = await cartOwner(db);
    const cart = owner ? await activeCart(db, owner) : null;
    const quantities = new Map<string, number>();
    for (const l of cart?.lines ?? []) quantities.set(String(l.variantId), (quantities.get(String(l.variantId)) ?? 0) + l.quantity);
    return { count: [...quantities.values()].reduce((a, b) => a + b, 0), quantities };
  } catch {
    return { count: 0, quantities: new Map() };
  }
});
