// Setup status shown by database-backed pages and /api/health. There is no fallback data.
// From B2 the database is actually checked (connection and replica-set topology, domain-rules §12).
// `ready` stays false even with a connected database until the store's settings and Owner exist
// (B3 setup, B4 settings): a connected but empty database is still a store being set up.
import { checkDatabase, databaseConfig, type DatabaseState } from "@/lib/adapters/db/client";
import { parseServerEnv } from "@/lib/env";

export interface SetupStatus {
  ready: boolean;
  /** Required variables that are unset (names only). */
  missing: string[];
  /** Variables that are set but invalid (names only). */
  invalid: string[];
  database: DatabaseState;
}

export async function getSetupStatus(
  raw: Record<string, string | undefined>,
  check: typeof checkDatabase = checkDatabase,
): Promise<SetupStatus> {
  const report = parseServerEnv(raw);
  const missing = report.integrations.database === "not_configured" ? ["MONGODB_URI"] : [];
  const invalid = report.issues.filter((i) => !i.problem.startsWith("required to complete")).map((i) => i.name);
  const database = invalid.includes("MONGODB_URI") || invalid.includes("MONGODB_DB") ? "not_configured" : await check(databaseConfig(raw));
  return { ready: false, missing, invalid, database };
}
