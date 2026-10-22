// Migrations (domain-rules §14). `npm run db:migrate` is idempotent:
// 1. every registered collection is created with its generated validator, or brought up to date with
//    `collMod` (validationLevel "strict", validationAction "error"), and its indexes are created;
// 2. one-time data migrations run in order and are recorded in `migrations`, so each runs once.
import type { Db } from "mongodb";
import { adapterCollections, collections as registry, type AdapterCollectionSpec, type CollectionSpec } from "./collections.ts";
import { seedBuiltInRoles } from "../modules/identity/roles.ts";
import { validatorFor } from "./validators.ts";

export interface DataMigration {
  /** `NNNN-kebab-name`; applied in lexical order. */
  id: string;
  up: (db: Db) => Promise<void>;
}

/** One-time data migrations, applied in id order and recorded in `migrations`. */
/**
 * 0002 (B9): reviews moved from one per customer per product to one per order line (domain-rules
 * §5.7). The new `orderId_lineId_unique` index is created with the collection's indexes above; this
 * drops the old `userId_productId_unique` index if a database still has it. Existing reviews are
 * kept as they are: under the old index each customer had at most one review per product, and each
 * review names one line of one order, so no existing pair can collide with the new index.
 */
async function reviewsPerOrderLine(db: Db) {
  const reviews = db.collection("reviews");
  const names = (await reviews.listIndexes().toArray()).map((i) => i.name as string);
  if (names.includes("userId_productId_unique")) await reviews.dropIndex("userId_productId_unique");
}

export const dataMigrations: DataMigration[] = [
  { id: "0001-built-in-staff-roles", up: (db) => seedBuiltInRoles(db) },
  { id: "0002-reviews-one-per-order-line", up: reviewsPerOrderLine },
];

export interface MigrationReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  indexes: Record<string, string[]>;
  applied: string[];
}

const VALIDATION = { validationLevel: "strict", validationAction: "error" } as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function syncCollection(db: Db, spec: CollectionSpec, report: MigrationReport) {
  const validator = validatorFor(spec);
  const [existing] = await db.listCollections({ name: spec.name }, { nameOnly: false }).toArray();
  if (!existing) {
    await db.createCollection(spec.name, { validator, ...VALIDATION });
    report.created.push(spec.name);
  } else {
    const options = (existing as { options?: Record<string, unknown> }).options ?? {};
    const current = { validator: options.validator, validationLevel: options.validationLevel, validationAction: options.validationAction };
    if (same(current, { validator, ...VALIDATION })) report.unchanged.push(spec.name);
    else {
      await db.command({ collMod: spec.name, validator, ...VALIDATION });
      report.updated.push(spec.name);
    }
  }
  report.indexes[spec.name] = spec.indexes.length > 0 ? await db.collection(spec.name).createIndexes(spec.indexes) : [];
}

/** Library-owned collections: created without a validator if missing, then indexed. */
async function syncAdapterCollection(db: Db, spec: AdapterCollectionSpec, report: MigrationReport) {
  const [existing] = await db.listCollections({ name: spec.name }, { nameOnly: true }).toArray();
  if (!existing) {
    await db.createCollection(spec.name);
    report.created.push(spec.name);
  } else report.unchanged.push(spec.name);
  report.indexes[spec.name] = await db.collection(spec.name).createIndexes(spec.indexes);
}

export async function runMigrations(
  db: Db,
  options: { collections?: CollectionSpec[]; adapterCollections?: AdapterCollectionSpec[]; migrations?: DataMigration[] } = {},
): Promise<MigrationReport> {
  const report: MigrationReport = { created: [], updated: [], unchanged: [], indexes: {}, applied: [] };
  const specs = options.collections ?? registry;
  for (const spec of specs) await syncCollection(db, spec, report);
  for (const spec of options.adapterCollections ?? adapterCollections) await syncAdapterCollection(db, spec, report);

  const pending = [...(options.migrations ?? dataMigrations)].sort((a, b) => a.id.localeCompare(b.id));
  const migrations = db.collection<{ _id: string; appliedAt: Date }>("migrations");
  for (const migration of pending) {
    if (await migrations.findOne({ _id: migration.id })) continue;
    await migration.up(db);
    await migrations.insertOne({ _id: migration.id, appliedAt: new Date() });
    report.applied.push(migration.id);
  }
  return report;
}
