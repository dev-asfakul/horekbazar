// Liveness and setup status (SCHEMA.md: public summary). Names and states only, never values.
// From B2 the database state is real: not_configured | connected | not_replica_set | unreachable.
// The per-port detail is on /admin/health (platform.read).
import { isMaintenanceMode } from "@/lib/maintenance";
import { getSetupStatus } from "@/lib/setup/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getSetupStatus(process.env);
  return Response.json(
    { status: "ok", setupRequired: !status.ready, maintenance: isMaintenanceMode(process.env), checks: { database: status.database } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
