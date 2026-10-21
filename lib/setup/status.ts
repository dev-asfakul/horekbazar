// Setup status shown by database-backed pages and /api/health.
// There is no fallback data: until the database port exists (phase B2) and is connected,
// every database-backed page shows the setup-required state.
import { parseServerEnv } from "@/lib/env";

export interface SetupStatus {
  ready: boolean;
  /** Required variables that are unset (names only). */
  missing: string[];
  /** Variables that are set but invalid (names only). */
  invalid: string[];
  database: "not_configured" | "not_checked";
}

export function getSetupStatus(raw: Record<string, string | undefined>): SetupStatus {
  const report = parseServerEnv(raw);
  const missing = report.integrations.database === "not_configured" ? ["MONGODB_URI"] : [];
  const invalid = report.issues.filter((i) => !i.problem.startsWith("required to complete")).map((i) => i.name);
  return {
    // The database port is not built yet, so a configured URI is still "not checked", never "connected".
    ready: false,
    missing,
    invalid,
    database: report.integrations.database === "configured" ? "not_checked" : "not_configured",
  };
}
