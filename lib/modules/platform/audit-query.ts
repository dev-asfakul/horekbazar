// Read side of the audit log (B10 /admin/audit, platform.read). Read-only: nothing here writes, updates
// or deletes audit rows. Filters come from the URL, so every value is validated and bounded before it
// reaches a query; unknown or malformed values are dropped, never passed through as operators.
// Values were redacted at write time (audit.ts); the viewer redacts again as defence in depth.
import type { Db, Filter } from "mongodb";
import { AUDIT_LOG, redact } from "./audit.ts";
import type { AuditLogDoc } from "./schema.ts";

export const AUDIT_PAGE_SIZE = 50;
/** Skip-based pages stay cheap only near the top; older history is reached by narrowing the dates. */
export const AUDIT_MAX_PAGE = 200;

export interface AuditFilters {
  /** Exact action ("staff.role_changed") or a namespace prefix ending in "." ("order."). */
  action?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  /** Asia/Dhaka calendar dates, inclusive. */
  from?: string;
  to?: string;
}

const ACTION = /^[a-z][a-z0-9_.]{0,99}$/;
const ID = /^[A-Za-z0-9_.:@-]{1,200}$/;
const TYPE = /^[a-z][a-z0-9_]{0,49}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

/** Start of a Dhaka calendar day (UTC+6, no DST) as an instant; null for anything that is not a real date. */
export function dhakaDayStart(day: string): Date | null {
  const m = DAY.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(utc - 6 * 3600_000);
}

export function parseAuditFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const f: AuditFilters = {};
  const action = one(sp.action);
  if (ACTION.test(action)) f.action = action;
  const actorId = one(sp.actor);
  if (ID.test(actorId)) f.actorId = actorId;
  const targetType = one(sp.type);
  if (TYPE.test(targetType)) f.targetType = targetType;
  const targetId = one(sp.target);
  if (ID.test(targetId)) f.targetId = targetId;
  const from = one(sp.from);
  if (dhakaDayStart(from)) f.from = from;
  const to = one(sp.to);
  if (dhakaDayStart(to)) f.to = to;
  return f;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function auditMongoFilter(f: AuditFilters): Filter<AuditLogDoc> {
  const q: Filter<AuditLogDoc> = {};
  if (f.action) q.action = f.action.endsWith(".") ? { $regex: `^${escapeRegex(f.action)}` } : f.action;
  if (f.actorId) q["actor.id"] = f.actorId;
  if (f.targetType) q["target.type"] = f.targetType;
  if (f.targetId) q["target.id"] = f.targetId;
  const at: { $gte?: Date; $lt?: Date } = {};
  if (f.from) at.$gte = dhakaDayStart(f.from)!;
  if (f.to) at.$lt = new Date(dhakaDayStart(f.to)!.getTime() + 24 * 3600_000);
  if (at.$gte || at.$lt) q.at = at;
  return q;
}

export interface AuditRow {
  id: string;
  at: Date;
  actor: { id: string; role: string };
  action: string;
  target: { type: string; id: string };
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
}

export async function listAuditLog(db: Db, filters: AuditFilters, requestedPage = 1) {
  const page = Math.min(Math.max(Math.trunc(requestedPage) || 1, 1), AUDIT_MAX_PAGE);
  const filter = auditMongoFilter(filters);
  const col = db.collection<AuditLogDoc>(AUDIT_LOG);
  const [total, docs] = await Promise.all([
    col.countDocuments(filter, { limit: AUDIT_PAGE_SIZE * AUDIT_MAX_PAGE }),
    col
      .find(filter)
      .sort({ at: -1, _id: -1 })
      .skip((page - 1) * AUDIT_PAGE_SIZE)
      .limit(AUDIT_PAGE_SIZE)
      .toArray(),
  ]);
  const rows: AuditRow[] = docs.map((d) => ({
    id: String(d._id),
    at: d.at,
    actor: d.actor,
    action: d.action,
    target: d.target,
    ...(d.before ? { before: redact(d.before) as Record<string, unknown> } : {}),
    ...(d.after ? { after: redact(d.after) as Record<string, unknown> } : {}),
    ...(d.ip ? { ip: d.ip } : {}),
  }));
  const pages = Math.max(1, Math.min(Math.ceil(total / AUDIT_PAGE_SIZE), AUDIT_MAX_PAGE));
  return { rows, total, page, pages, capped: total >= AUDIT_PAGE_SIZE * AUDIT_MAX_PAGE };
}

/** The query string for a page of the current filters (the Pager keeps filters across pages). */
export function auditQueryString(f: AuditFilters, page?: number): string {
  const p = new URLSearchParams();
  if (f.action) p.set("action", f.action);
  if (f.actorId) p.set("actor", f.actorId);
  if (f.targetType) p.set("type", f.targetType);
  if (f.targetId) p.set("target", f.targetId);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (page && page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
