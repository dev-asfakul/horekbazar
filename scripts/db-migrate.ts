// npm run db:migrate: creates or updates every registered collection's validator and indexes, then
// runs pending one-time data migrations (lib/db/migrate.ts). Idempotent; safe to run on every deploy.
// Requires a replica set (domain-rules §12). Prints collection names and counts, never the URI.
import { closeDatabase, DatabaseNotReadyError, getDatabase } from "../lib/adapters/db/client.ts";
import { runMigrations } from "../lib/db/migrate.ts";

try {
  const db = await getDatabase();
  const r = await runMigrations(db);
  console.log(`database: ${db.databaseName}`);
  console.log(`created:   ${r.created.join(", ") || "none"}`);
  console.log(`updated:   ${r.updated.join(", ") || "none"}`);
  console.log(`unchanged: ${r.unchanged.join(", ") || "none"}`);
  console.log(`indexes:   ${Object.entries(r.indexes).map(([c, i]) => `${c}(${i.length})`).join(", ")}`);
  console.log(`data migrations applied: ${r.applied.join(", ") || "none"}`);
} catch (error) {
  console.error(error instanceof DatabaseNotReadyError ? `Cannot migrate: ${error.message}. See README.md → Database.` : `Migration failed: ${error instanceof Error ? error.message.replace(/\/\/[^/\s@]+@/g, "//***@") : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
