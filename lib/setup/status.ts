// Setup status shown by database-backed pages and /api/health. There is no fallback data.
// From B2 the database is actually checked (connection and replica-set topology, domain-rules §12).
// `ready` is true only with a connected database, an Owner (B3 setup) and saved store settings (B4):
// a connected but empty database is still a store being set up.
import { checkDatabase, databaseConfig, getDatabase, type DatabaseState } from "@/lib/adapters/db/client";
import { parseServerEnv } from "@/lib/env";
import { OWNER_ROLE_KEY } from "@/lib/modules/identity/capabilities";
import { AUTH_COLLECTIONS, INSTALLATION } from "@/lib/modules/identity/schema";
import { SETTINGS } from "@/lib/modules/settings/schema";

export interface SetupStatus {
  ready: boolean;
  /** Required variables that are unset (names only). */
  missing: string[];
  /** Variables that are set but invalid (names only). */
  invalid: string[];
  database: DatabaseState;
}

/** True once an Owner exists and the store settings have been saved at least once (B3 + B4 setup). */
export async function storeConfigured(raw: Record<string, string | undefined>): Promise<boolean> {
  const db = await getDatabase(raw);
  const [installation, owner, settings] = await Promise.all([
    db.collection<{ _id: string }>(INSTALLATION).findOne({ _id: "installation" }, { projection: { _id: 1 } }),
    db.collection(AUTH_COLLECTIONS.user).findOne({ staffRoleKey: OWNER_ROLE_KEY }, { projection: { _id: 1 } }),
    db.collection(SETTINGS).findOne({}, { projection: { _id: 1 } }),
  ]);
  return Boolean((installation || owner) && settings);
}

export async function getSetupStatus(
  raw: Record<string, string | undefined>,
  check: typeof checkDatabase = checkDatabase,
  configured: typeof storeConfigured = storeConfigured,
): Promise<SetupStatus> {
  const report = parseServerEnv(raw);
  const missing = report.integrations.database === "not_configured" ? ["MONGODB_URI"] : [];
  const invalid = report.issues.filter((i) => !i.problem.startsWith("required to complete")).map((i) => i.name);
  const database = invalid.includes("MONGODB_URI") || invalid.includes("MONGODB_DB") ? "not_configured" : await check(databaseConfig(raw));
  const ready = database === "connected" && missing.length === 0 && invalid.length === 0 && (await configured(raw).catch(() => false));
  return { ready, missing, invalid, database };
}
