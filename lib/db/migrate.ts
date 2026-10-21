// Migrations (domain-rules §14). `npm run db:migrate` is idempotent:
// 1. every registered collection is created with its generated validator, or brought up to date with
//    `collMod` (validationLevel "strict", validationAction "error"), and its indexes are created;
// 2. one-time data migrations run in order and are recorded in `migrations`, so each runs once.
import type { Db } from "mongodb";
import { collections as registry, type CollectionSpec } from "./collections.ts";
import { validatorFor } from "./validators.ts";

export interface DataMigration {
  /** `NNNN-kebab-name`; applied in lexical order. */
  id: string;
  up: (db: Db) => Promise<void>;
}

/** One-time data migrations. None exist yet: B2 only creates collections, validators and indexes. */
export const dataMigrations: DataMigration[] = [];

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

export async function runMigrations(
  db: Db,
  options: { collections?: CollectionSpec[]; migrations?: DataMigration[] } = {},
): Promise<MigrationReport> {
  const report: MigrationReport = { created: [], updated: [], unchanged: [], indexes: {}, applied: [] };
  const specs = options.collections ?? registry;
  for (const spec of specs) await syncCollection(db, spec, report);

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
