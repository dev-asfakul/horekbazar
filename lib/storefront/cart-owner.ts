// Who owns the cart for this request (B6). A signed-in customer owns a cart by user id; anyone else
// by a random device id in an httpOnly cookie, created on the first add. When a customer signs in
// with a device cart, the device lines are merged into their cart (idempotent: the device cart is
// removed by the merge, so a second request finds nothing to merge).
import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Db } from "mongodb";
import { getPrincipal } from "@/lib/auth/server";
import { mergeDeviceCart, type CartOwner } from "@/lib/modules/pricing/cart";

export const CART_COOKIE = "cart_device";
const DEVICE_ID = /^[a-f0-9]{32}$/;
const MAX_AGE = 60 * 24 * 3600;

/** Current owner, or null for a visitor with no device cart yet. Merges a device cart after sign-in. */
export async function cartOwner(db: Db): Promise<CartOwner | null> {
  const jar = await cookies();
  const raw = jar.get(CART_COOKIE)?.value;
  const deviceId = raw && DEVICE_ID.test(raw) ? raw : undefined;
  const principal = await getPrincipal();
  if (principal) {
    if (deviceId) await mergeDeviceCart(db, deviceId, principal.user.id);
    return { userId: principal.user.id };
  }
  return deviceId ? { deviceId } : null;
}

/** For server actions: the owner, creating the device cookie when there is none. */
export async function cartOwnerForWrite(db: Db): Promise<CartOwner> {
  const owner = await cartOwner(db);
  const jar = await cookies();
  if (owner && "userId" in owner) {
    if (jar.get(CART_COOKIE)) jar.delete(CART_COOKIE);
    return owner;
  }
  if (owner) return owner;
  const deviceId = randomBytes(16).toString("hex");
  jar.set(CART_COOKIE, deviceId, { httpOnly: true, sameSite: "lax", secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"), path: "/", maxAge: MAX_AGE });
  return { deviceId };
}
