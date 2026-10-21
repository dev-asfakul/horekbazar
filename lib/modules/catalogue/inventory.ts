// Inventory receipts and adjustments (domain-rules §4, §4.1). Each line of one staff submission is
// one `inventoryLedger` row with the canonical key `stock:<adjustmentId>:<variantId>:<kind>`; the
// unique index makes a retried submission return the original rows and move nothing. Stock and
// ledger writes for one submission happen in one transaction; lines are processed in variantId order.
// `available` never goes below zero: a negative adjustment is a guarded update on onHand and available.
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { recordAudit } from "../platform/audit.ts";
import { CatalogueError, inTransaction, isDuplicateKey, toObjectId, type Actor } from "./common.ts";
import { INVENTORY_LEDGER, STOCK, VARIANTS, type InventoryLedgerDoc, type StockDoc } from "./schema.ts";

export const ADJUSTMENT_ID = /^[A-Za-z0-9_-]{8,100}$/;

export interface StockMovementInput {
  /** The client request key of the dialog (request-key scope `inventory`); a retry reuses it. */
  adjustmentId: string;
  kind: "receive" | "adjust";
  /** Required for adjustments (domain-rules §4). */
  reason?: string | undefined;
  lines: { variantId: string; qty: number }[];
}

export interface StockMovementResult {
  replayed: boolean;
  rows: Pick<InventoryLedgerDoc, "variantId" | "qty" | "onHandAfter" | "idempotencyKey">[];
}

export const ledgerKey = (adjustmentId: string, variantId: string, kind: "receive" | "adjust") => `stock:${adjustmentId}:${variantId}:${kind}`;

function validate(input: StockMovementInput) {
  if (!ADJUSTMENT_ID.test(input.adjustmentId)) throw new CatalogueError("invalid");
  if (input.lines.length === 0 || input.lines.length > 50) throw new CatalogueError("invalid");
  const seen = new Set<string>();
  for (const line of input.lines) {
    toObjectId(line.variantId);
    if (seen.has(line.variantId)) throw new CatalogueError("invalid");
    seen.add(line.variantId);
    if (!Number.isInteger(line.qty) || Math.abs(line.qty) > 1_000_000) throw new CatalogueError("invalid");
    if (input.kind === "receive" ? line.qty <= 0 : line.qty === 0) throw new CatalogueError("invalid");
  }
  if (input.kind === "adjust" && !input.reason?.trim()) throw new CatalogueError("invalid", { field: "reason" });
}

async function apply(db: Db, client: MongoClient, actor: Actor, input: StockMovementInput): Promise<StockMovementResult> {
  const lines = [...input.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  return inTransaction(client, async (session) => {
    const ledger = db.collection<InventoryLedgerDoc>(INVENTORY_LEDGER);
    const keys = lines.map((l) => ledgerKey(input.adjustmentId, l.variantId, input.kind));
    const existing = await ledger.find({ idempotencyKey: { $in: keys } }, { session }).toArray();
    if (existing.length > 0) {
      // A replay must be the same submission: same lines, same quantities (otherwise the key was reused).
      const byKey = new Map(existing.map((r) => [r.idempotencyKey, r]));
      const same = existing.length === lines.length && lines.every((l, i) => byKey.get(keys[i]!)?.qty === l.qty);
      if (!same) throw new CatalogueError("idempotency_key_reused");
      return { replayed: true, rows: keys.map((k) => byKey.get(k)!).map(({ variantId, qty, onHandAfter, idempotencyKey }) => ({ variantId, qty, onHandAfter, idempotencyKey })) };
    }
    const now = new Date();
    const rows: StockMovementResult["rows"] = [];
    for (const [i, line] of lines.entries()) {
      const variantId = new ObjectId(line.variantId);
      if (!(await db.collection(VARIANTS).findOne({ _id: variantId }, { session, projection: { _id: 1 } }))) throw new CatalogueError("not_found", { variantId: line.variantId });
      const guard = line.qty < 0 ? { onHand: { $gte: -line.qty }, available: { $gte: -line.qty } } : {};
      const after = await db
        .collection<StockDoc>(STOCK)
        .findOneAndUpdate({ variantId, ...guard }, { $inc: { onHand: line.qty, available: line.qty, version: 1 }, $set: { updatedAt: now } }, { session, returnDocument: "after" });
      if (!after) {
        const current = await db.collection<StockDoc>(STOCK).findOne({ variantId }, { session });
        if (!current) throw new CatalogueError("not_found", { variantId: line.variantId });
        throw new CatalogueError("insufficient_stock", { variantId: line.variantId, available: current.available, onHand: current.onHand });
      }
      const row: Omit<InventoryLedgerDoc, "_id"> = {
        variantId,
        kind: input.kind,
        qty: line.qty,
        onHandAfter: after.onHand,
        reservedAfter: after.reserved,
        actor: { type: "staff", id: actor.id },
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        refType: "stock",
        refId: input.adjustmentId,
        lineRef: line.variantId,
        idempotencyKey: keys[i]!,
        createdAt: now,
      };
      await ledger.insertOne(row as InventoryLedgerDoc, { session });
      rows.push({ variantId, qty: line.qty, onHandAfter: after.onHand, idempotencyKey: row.idempotencyKey });
    }
    await recordAudit(
      db,
      {
        actor: { id: actor.id, role: actor.role },
        action: `inventory.${input.kind}`,
        target: { type: "adjustment", id: input.adjustmentId },
        after: { lines: rows.map((r) => ({ variantId: String(r.variantId), qty: r.qty, onHandAfter: r.onHandAfter })), reason: input.reason?.trim() },
        ip: actor.ip ?? null,
      },
      { session, now },
    );
    return { replayed: false, rows };
  });
}

/** Receives or adjusts stock. A retry with the same adjustmentId and lines returns `replayed: true`. */
export async function moveStock(db: Db, client: MongoClient, actor: Actor, input: StockMovementInput): Promise<StockMovementResult> {
  validate(input);
  try {
    return await apply(db, client, actor, input);
  } catch (error) {
    // A concurrent identical submission committed first: re-read and return its rows.
    if (isDuplicateKey(error)) return apply(db, client, actor, input);
    throw error;
  }
}

export async function setLowStockThreshold(db: Db, actor: Actor, variantId: string, threshold: number) {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100000) throw new CatalogueError("invalid");
  const id = toObjectId(variantId);
  const before = await db.collection<StockDoc>(STOCK).findOneAndUpdate({ variantId: id }, { $set: { lowStockThreshold: threshold, updatedAt: new Date() }, $inc: { version: 1 } });
  if (!before) throw new CatalogueError("not_found");
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "inventory.threshold_set", target: { type: "variant", id: variantId }, before: { lowStockThreshold: before.lowStockThreshold }, after: { lowStockThreshold: threshold }, ip: actor.ip ?? null });
}

/** Kinds whose `qty` is a change to onHand (reserve and release change only `reserved`). */
const ON_HAND_KINDS = ["receive", "adjust", "commit", "restock"] as const;

export interface Drift {
  variantId: string;
  stockOnHand: number | null;
  ledgerOnHand: number;
}

/**
 * Recomputes onHand from the ledger and reports (never fixes) differences (domain-rules §4 rule 5).
 * Replaying the ledger of a consistent store changes nothing and reports no drift.
 */
export async function reconcileStock(db: Db): Promise<Drift[]> {
  const sums = await db
    .collection(INVENTORY_LEDGER)
    .aggregate<{ _id: ObjectId; onHand: number }>([{ $match: { kind: { $in: [...ON_HAND_KINDS] } } }, { $group: { _id: "$variantId", onHand: { $sum: "$qty" } } }])
    .toArray();
  const ledger = new Map(sums.map((s) => [String(s._id), s.onHand]));
  const drift: Drift[] = [];
  for await (const s of db.collection<StockDoc>(STOCK).find({}, { projection: { variantId: 1, onHand: 1, reserved: 1, available: 1 } })) {
    const key = String(s.variantId);
    const expected = ledger.get(key) ?? 0;
    if (expected !== s.onHand || s.available !== s.onHand - s.reserved) drift.push({ variantId: key, stockOnHand: s.onHand, ledgerOnHand: expected });
    ledger.delete(key);
  }
  for (const [variantId, onHand] of ledger) drift.push({ variantId, stockOnHand: null, ledgerOnHand: onHand });
  return drift;
}

export async function ledgerFor(db: Db, variantId: string, limit = 50) {
  return db.collection<InventoryLedgerDoc>(INVENTORY_LEDGER).find({ variantId: toObjectId(variantId) }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
}
