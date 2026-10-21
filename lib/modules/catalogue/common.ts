// Shared catalogue service helpers: the actor written to the audit log, the rule error whose `code`
// becomes a localised admin message (forms.errors.catalogue_<code>), id parsing and transactions.
import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";

export interface Actor {
  id: string;
  role: string;
  ip?: string | null;
}

export type CatalogueErrorCode =
  | "not_found"
  | "version_conflict"
  | "slug_taken"
  | "slug_locked"
  | "sku_taken"
  | "parent_not_found"
  | "depth_exceeded"
  | "cycle"
  | "parent_has_products"
  | "parent_unpublished"
  | "has_children"
  | "has_products"
  | "category_not_leaf"
  | "category_not_found"
  | "category_unpublished"
  | "no_sellable_variant"
  | "compare_at_not_higher"
  | "sample_publish_blocked"
  | "in_use"
  | "insufficient_stock"
  | "idempotency_key_reused"
  | "invalid";

export class CatalogueError extends Error {
  constructor(
    readonly code: CatalogueErrorCode,
    readonly detail?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export function toObjectId(id: string | ObjectId): ObjectId {
  if (id instanceof ObjectId) return id;
  if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) throw new CatalogueError("not_found");
  return new ObjectId(id);
}

/** Sample records may be published only in a development database (owner change to D11, 2026-10-22). */
export const isDevelopmentDatabase = (db: Db) => db.databaseName.endsWith("_dev");

export async function inTransaction<T>(client: MongoClient, body: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = client.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await body(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

/** Drops undefined values so `$set` never writes them (validators reject `undefined`-turned-null fields). */
export function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** `$unset` for optional fields the patch leaves out, or nothing when every field is present. */
export function unsetMissing<T extends object>(patch: T, keys: readonly (keyof T & string)[]): { $unset?: Record<string, ""> } {
  const missing = keys.filter((k) => patch[k] === undefined);
  return missing.length ? { $unset: Object.fromEntries(missing.map((k) => [k, ""])) as Record<string, ""> } : {};
}
