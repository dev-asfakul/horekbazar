// Liveness and setup status. Reports names and states only, never values.
// The database is "not_checked" until the database port exists (phase B2): no connection is claimed.
import { isMaintenanceMode } from "@/lib/maintenance";
import { getSetupStatus } from "@/lib/setup/status";

export const dynamic = "force-dynamic";

export function GET() {
  const status = getSetupStatus(process.env);
  return Response.json(
    { status: "ok", setupRequired: !status.ready, maintenance: isMaintenanceMode(process.env), checks: { database: status.database } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
