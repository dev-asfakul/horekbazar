// C-03 (2026-10-23): every /admin/audit query is served by an index in its { at: -1, _id: -1 } order.
// Before the change the unfiltered, action and actor queries were COLLSCAN + in-memory SORT.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db, Document } from "mongodb";
import type { AuditLogDoc } from "@/lib/modules/platform/schema";
import { collections } from "@/lib/db/collections";
import { runMigrations } from "@/lib/db/migrate";
import { AUDIT_LOG, recordAudit } from "@/lib/modules/platform/audit";
import { auditMongoFilter, type AuditFilters } from "@/lib/modules/platform/audit-query";
import { freshDb } from "./helpers";

let db: Db;
let cleanup: () => Promise<void>;

const ACTIONS = ["order.status_changed", "order.cancelled", "catalogue.product_updated", "staff.role_set", "identity.owner_claimed"];
const ACTORS = ["owner-1", "staff-2", "system"];

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  await runMigrations(db, { collections: collections.filter((c) => c.name === AUDIT_LOG), adapterCollections: [], migrations: [] });
  const start = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 400; i++) {
    await recordAudit(
      db,
      { actor: { id: ACTORS[i % 3]!, role: "owner" }, action: ACTIONS[i % 5]!, target: { type: "order", id: `o${i % 40}` } },
      { now: new Date(start + i * 3600_000) },
    );
  }
});

afterAll(async () => cleanup?.());

/** The stage names of the winning plan, outermost first ("LIMIT", "FETCH", "IXSCAN(name)", …). */
async function plan(f: AuditFilters): Promise<string[]> {
  const e = (await db.collection<AuditLogDoc>(AUDIT_LOG).find(auditMongoFilter(f)).sort({ at: -1, _id: -1 }).limit(50).explain("queryPlanner")) as Document;
  const out: string[] = [];
  const walk = (n: Document | undefined) => {
    if (!n) return;
    out.push(n.indexName ? `${n.stage}(${n.indexName})` : n.stage);
    walk(n.inputStage);
    for (const s of n.inputStages ?? []) walk(s);
  };
  walk(e.queryPlanner.winningPlan.queryPlan ?? e.queryPlanner.winningPlan);
  return out;
}

describe("auditLog indexes (C-03)", () => {
  it("exist with the documented keys; the earlier indexes are kept", async () => {
    const byName = Object.fromEntries((await db.collection(AUDIT_LOG).indexes()).map((i) => [i.name, i.key]));
    expect(byName).toMatchObject({
      at_desc: { at: -1 },
      target: { "target.type": 1, "target.id": 1 },
      at_id_desc: { at: -1, _id: -1 },
      action_at_id: { action: 1, at: -1, _id: -1 },
      actor_at_id: { "actor.id": 1, at: -1, _id: -1 },
    });
  });

  it.each<[string, AuditFilters, string]>([
    ["no filter", {}, "at_id_desc"],
    ["exact action", { action: "order.cancelled" }, "action_at_id"],
    ["actor", { actorId: "staff-2" }, "actor_at_id"],
    ["action and dates", { action: "staff.role_set", from: "2026-10-02", to: "2026-10-05" }, "action_at_id"],
  ])("%s: index scan in sort order, no collection scan and no in-memory sort", async (_label, f, index) => {
    const stages = await plan(f);
    expect(stages).toContain(`IXSCAN(${index})`);
    expect(stages).not.toContain("COLLSCAN");
    expect(stages).not.toContain("SORT");
  });

  it("an action namespace prefix uses an index (bounded range on action), never a collection scan", async () => {
    const stages = await plan({ action: "order." });
    expect(stages.some((s) => s.startsWith("IXSCAN("))).toBe(true);
    expect(stages).not.toContain("COLLSCAN");
  });
});
