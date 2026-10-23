// Read side of customer records for /admin/customers (B10, customers.read). Read-only and least
// privilege: only the fields a store needs to help a customer are projected; password hashes, session
// tokens, 2FA secrets and Better Auth internals are never selected. Order and address data come from
// the orders module's own collections (owned by userId), one query each, not one per customer.
import { ObjectId, type Db, type Document } from "mongodb";
import { ADDRESSES, ORDERS, type AddressDoc, type OrderDoc } from "../orders/schema.ts";
import { idFilter } from "./principal.ts";
import { AUTH_COLLECTIONS } from "./schema.ts";
import { openDeletionRequest, openDeletionRequests } from "./privacy.ts";

export const CUSTOMER_PAGE_SIZE = 50;
export const CUSTOMER_MAX_PAGE = 200;

export interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone?: string;
  createdAt?: Date;
  orders: number;
}

const PROJECTION = { name: 1, email: 1, emailVerified: 1, phone: 1, locale: 1, createdAt: 1, twoFactorEnabled: 1 } as const;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A search box value: trimmed, bounded, and matched literally (never as a regex or operator). */
/** Staff accounts are managed on /admin/staff (staff.manage) and never listed here. */
export const NOT_STAFF = { staffRoleKey: { $not: { $type: "string" } } } as const;

export function customerSearchFilter(raw: string): Document {
  const q = raw.trim().slice(0, 80);
  if (!q) return { ...NOT_STAFF };
  const re = { $regex: escapeRegex(q), $options: "i" };
  const digits = q.replace(/[^\d]/g, "");
  const or: Document[] = [{ email: re }, { name: re }];
  if (digits.length >= 4) or.push({ phone: { $regex: escapeRegex(digits) } });
  return { ...NOT_STAFF, $or: or };
}

function summary(u: Document, orders: number): CustomerSummary {
  return {
    id: String(u._id),
    name: typeof u.name === "string" ? u.name : "",
    email: typeof u.email === "string" ? u.email : "",
    emailVerified: u.emailVerified === true,
    ...(typeof u.phone === "string" ? { phone: u.phone } : {}),
    ...(u.createdAt instanceof Date ? { createdAt: u.createdAt } : {}),
    orders,
  };
}

async function orderCounts(db: Db, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .collection<OrderDoc>(ORDERS)
    .aggregate<{ _id: string; n: number }>([{ $match: { userId: { $in: userIds } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

export async function listCustomers(db: Db, q: string, requestedPage = 1) {
  const page = Math.min(Math.max(Math.trunc(requestedPage) || 1, 1), CUSTOMER_MAX_PAGE);
  const filter = customerSearchFilter(q);
  const users = db.collection(AUTH_COLLECTIONS.user);
  const [total, docs] = await Promise.all([
    users.countDocuments(filter, { limit: CUSTOMER_PAGE_SIZE * CUSTOMER_MAX_PAGE }),
    users
      .find(filter, { projection: PROJECTION })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * CUSTOMER_PAGE_SIZE)
      .limit(CUSTOMER_PAGE_SIZE)
      .toArray(),
  ]);
  const counts = await orderCounts(db, docs.map((d) => String(d._id)));
  const pages = Math.max(1, Math.min(Math.ceil(total / CUSTOMER_PAGE_SIZE), CUSTOMER_MAX_PAGE));
  return { customers: docs.map((d) => summary(d, counts.get(String(d._id)) ?? 0)), total, page, pages };
}

export interface CustomerDetail extends CustomerSummary {
  locale?: string;
  twoFactorEnabled: boolean;
  addresses: Pick<AddressDoc, "label" | "name" | "phone" | "district" | "area" | "line" | "landmark" | "isDefault">[];
  recentOrders: Pick<OrderDoc, "orderNumber" | "status" | "placedAt" | "totals">[];
  /** When the customer asked for deletion (B10 part b), while the request is open. */
  deletionRequestedAt?: Date;
}

export const isCustomerId = (id: string) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;

export async function getCustomer(db: Db, id: string): Promise<CustomerDetail | null> {
  if (!isCustomerId(id)) return null;
  const u = await db.collection(AUTH_COLLECTIONS.user).findOne({ _id: idFilter(id) as never, ...NOT_STAFF }, { projection: PROJECTION });
  if (!u) return null;
  const userId = String(u._id);
  const [addresses, recentOrders, counts, deletion] = await Promise.all([
    db
      .collection<AddressDoc>(ADDRESSES)
      .find({ userId }, { projection: { _id: 0, label: 1, name: 1, phone: 1, district: 1, area: 1, line: 1, landmark: 1, isDefault: 1 } })
      .sort({ isDefault: -1, updatedAt: -1 })
      .limit(10)
      .toArray(),
    db
      .collection<OrderDoc>(ORDERS)
      .find({ userId }, { projection: { _id: 0, orderNumber: 1, status: 1, placedAt: 1, totals: 1 } })
      .sort({ placedAt: -1 })
      .limit(20)
      .toArray(),
    orderCounts(db, [userId]),
    openDeletionRequest(db, userId),
  ]);
  return {
    ...summary(u, counts.get(userId) ?? 0),
    ...(typeof u.locale === "string" ? { locale: u.locale } : {}),
    twoFactorEnabled: u.twoFactorEnabled === true,
    addresses,
    recentOrders,
    ...(deletion ? { deletionRequestedAt: deletion.createdAt } : {}),
  };
}

/** Open deletion requests with the customer's name and e-mail, oldest first (customers.read). */
export async function pendingDeletions(db: Db, limit = 50) {
  const open = await openDeletionRequests(db, limit);
  if (open.length === 0) return [];
  const users = await db
    .collection(AUTH_COLLECTIONS.user)
    .find({ _id: { $in: open.flatMap((r) => (ObjectId.isValid(r.userId) ? [r.userId, new ObjectId(r.userId)] : [r.userId])) } as never }, { projection: { name: 1, email: 1 } })
    .toArray();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return open.map((r) => ({ userId: r.userId, requestedAt: r.createdAt, name: String(byId.get(r.userId)?.name ?? ""), email: String(byId.get(r.userId)?.email ?? "") }));
}
