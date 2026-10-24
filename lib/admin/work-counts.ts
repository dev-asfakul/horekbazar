// Admin home "Work waiting" counts (Proposal A1, docs/ADMIN-REDESIGN-A1.md §4). Read-only counts over
// existing collections and statuses; each count is returned only when the role holds the capability of
// the section it links to, so a count never shows what the section would refuse. Capped at CAP (the
// UI shows "99+"), so a large backlog cannot make the query expensive. No caching, no new indexes.
import type { Db } from "mongodb";
import { STOCK } from "../modules/catalogue/schema.ts";
import { RETURNS } from "../modules/fulfilment/schema.ts";
import type { Capability } from "../modules/identity/capabilities.ts";
import { CONVERSATIONS } from "../modules/messaging/schema.ts";
import { ORDERS } from "../modules/orders/schema.ts";

export const WORK_COUNT_CAP = 100;

export type WorkCountKey = "orders" | "messages" | "returns" | "lowStock";

export interface WorkCountDef {
  key: WorkCountKey;
  capability: Capability;
  /** Existing filtered list the card links to. */
  href: string;
  collection: string;
  filter: Record<string, unknown>;
}

export const WORK_COUNTS: readonly WorkCountDef[] = [
  {
    key: "orders",
    capability: "orders.read",
    href: "/admin/orders?status=pending_confirmation",
    collection: ORDERS,
    filter: { status: "pending_confirmation" },
  },
  {
    key: "messages",
    capability: "messages.reply",
    href: "/admin/messages?status=open",
    collection: CONVERSATIONS,
    filter: { status: "open" },
  },
  {
    key: "returns",
    capability: "returns.process",
    href: "/admin/returns?status=requested",
    collection: RETURNS,
    filter: { status: "requested" },
  },
  // Same rule as /admin/inventory?low=1 (variants at or below their own threshold).
  {
    key: "lowStock",
    capability: "inventory.adjust",
    href: "/admin/inventory?low=1",
    collection: STOCK,
    filter: { $expr: { $lte: ["$available", "$lowStockThreshold"] } },
  },
];


/** One capped count. Throws on database errors; callers show "Couldn't load", never 0. */
export async function countWork(db: Db, def: WorkCountDef): Promise<number> {
  return db.collection(def.collection).countDocuments(def.filter, { limit: WORK_COUNT_CAP, maxTimeMS: 2000 });
}

/** "99+" above the visible range. */
export const formatWorkCount = (n: number) => (n >= WORK_COUNT_CAP ? "99+" : String(n));
