// Guest orders (Phase F part 3, BUILD-PLAN D28).
//
// A guest order has no `userId`. It is reached only through a secret link:
//   token = HMAC-SHA256(AUTH_SECRET, "hb-guest-order:" + orderId), base64url (43 characters, 256 bits)
// The order stores only SHA-256(token) (`guest.tokenHash`, unique index), so the database never holds
// a usable link and the order number alone never opens anything. The token can be re-derived on the
// server for the status emails without keeping it anywhere. Links stop working GUEST_LINK_DAYS after
// placement (`guest.expiresAt`); a claimed order is then only visible in the claiming account.
//
// Claim: a signed-in customer whose email is verified and equal (case-insensitively) to the order's
// email may add the order to their account, from the secret link only. Entering an existing email at
// checkout never merges anything.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Db, ObjectId } from "mongodb";
import { CommerceError } from "../pricing/cart.ts";
import { ORDERS, type OrderDoc } from "./schema.ts";

export const GUEST_LINK_DAYS = 180;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function secret(env: Record<string, string | undefined> = process.env): string {
  const s = env.AUTH_SECRET;
  if (!s || s.length < 32) throw new CommerceError("checkout_unavailable");
  return s;
}

/** The secret link token for a guest order (deterministic, needs AUTH_SECRET). */
export function guestOrderToken(orderId: ObjectId | string, env?: Record<string, string | undefined>): string {
  return createHmac("sha256", secret(env)).update(`hb-guest-order:${String(orderId)}`).digest("base64url");
}

export const hashGuestToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const isGuestToken = (value: string) => TOKEN.test(value);

/** The public path of a guest order's status page. */
export const guestOrderPath = (locale: "bn" | "en", token: string) => `${locale === "en" ? "/en" : ""}/order-status/${token}`;

/** The current link for this order, or null when the order is not a guest order or the secret changed. */
export function guestLinkFor(order: Pick<OrderDoc, "_id" | "guest">, env?: Record<string, string | undefined>): string | null {
  if (!order.guest) return null;
  try {
    const token = guestOrderToken(order._id, env);
    const a = Buffer.from(hashGuestToken(token), "hex");
    const b = Buffer.from(order.guest.tokenHash, "hex");
    return a.length === b.length && timingSafeEqual(a, b) ? token : null;
  } catch {
    return null;
  }
}

export type GuestOrderLookup = { state: "open"; order: OrderDoc } | { state: "claimed"; order: OrderDoc } | { state: "expired" } | { state: "not_found" };

/** Finds the guest order a link points to. Never by order number. */
export async function findGuestOrder(db: Db, token: string, now = new Date()): Promise<GuestOrderLookup> {
  if (!isGuestToken(token)) return { state: "not_found" };
  const order = await db.collection<OrderDoc>(ORDERS).findOne({ "guest.tokenHash": hashGuestToken(token) });
  if (!order?.guest) return { state: "not_found" };
  if (order.userId) return { state: "claimed", order };
  if (order.guest.expiresAt <= now) return { state: "expired" };
  return { state: "open", order };
}

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether this signed-in customer may claim the order (verified email equal to the order email). */
export function canClaim(order: Pick<OrderDoc, "userId" | "customer">, user: { email: string; emailVerified: boolean }): boolean {
  return !order.userId && user.emailVerified && Boolean(order.customer.email) && sameEmail(order.customer.email, user.email);
}

/**
 * Adds a guest order to the signed-in customer's account. Compare-and-set on "still unclaimed", so
 * two claims cannot both succeed. Refuses unless the email is verified and matches.
 */
export async function claimGuestOrder(db: Db, token: string, user: { id: string; email: string; emailVerified: boolean }, now = new Date()): Promise<{ orderNumber: string }> {
  const found = await findGuestOrder(db, token, now);
  if (found.state === "claimed") {
    if (found.order.userId === user.id) return { orderNumber: found.order.orderNumber };
    throw new CommerceError("claim_not_allowed");
  }
  if (found.state !== "open") throw new CommerceError("not_found");
  if (!user.emailVerified) throw new CommerceError("claim_email_unverified");
  if (!canClaim(found.order, user)) throw new CommerceError("claim_not_allowed");
  const res = await db
    .collection<OrderDoc>(ORDERS)
    .updateOne({ _id: found.order._id, "guest.tokenHash": found.order.guest!.tokenHash, userId: { $exists: false } }, { $set: { userId: user.id, "guest.claimedAt": now, updatedAt: now } });
  if (res.matchedCount === 0) throw new CommerceError("claim_not_allowed");
  return { orderNumber: found.order.orderNumber };
}
