// Audit log writer (SCHEMA.md `auditLog`; DESIGN.md security: append-only, redacted, truncated IP).
// Callers pass before/after snapshots; only changed fields are stored and personal or secret fields
// are replaced with "[redacted]". Nothing here updates or deletes audit rows.
import type { ClientSession, Db } from "mongodb";
import type { AuditLogDoc } from "./schema.ts";

export const AUDIT_LOG = "auditLog";

/** Field names whose values never enter the audit log (matched case-insensitively, at any depth). */
const REDACTED_KEYS = /^(phone|mobile|email|fullname|recipientname|address|addressline\d*|ip|otp|totp|cookie|authorization)$|secret|token|password|apikey|api_key/i;

export const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Date) && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, REDACTED_KEYS.test(k) ? REDACTED : redact(v, depth + 1)]));
  }
  return value;
}

/** Top-level fields whose values differ between before and after, redacted. */
export function auditDiff(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of keys) {
    const x = before?.[key];
    const y = after?.[key];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    if (before && key in before) b[key] = x;
    if (after && key in after) a[key] = y;
  }
  return { before: redact(b) as Record<string, unknown>, after: redact(a) as Record<string, unknown> };
}

/** IPv4 keeps the first three octets (/24); IPv6 keeps the first three groups (/48). */
export function truncateIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  const v = ip.trim().replace(/^::ffff:/, "");
  const v4 = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  if (v.includes(":")) {
    const groups = v.split("::")[0]!.split(":").filter(Boolean).slice(0, 3);
    return `${groups.join(":")}::`;
  }
  return undefined;
}

export interface AuditInput {
  actor: AuditLogDoc["actor"];
  action: string;
  target: AuditLogDoc["target"];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(db: Db, input: AuditInput, options: { session?: ClientSession; now?: Date } = {}) {
  const diff = input.before || input.after ? auditDiff(input.before, input.after) : null;
  const ip = truncateIp(input.ip);
  const doc: Omit<AuditLogDoc, "_id"> = {
    actor: input.actor,
    action: input.action,
    target: input.target,
    ...(diff && input.before ? { before: diff.before } : {}),
    ...(diff && input.after ? { after: diff.after } : {}),
    ...(ip ? { ip } : {}),
    at: options.now ?? new Date(),
  };
  await db.collection(AUDIT_LOG).insertOne(doc, options.session ? { session: options.session } : {});
}
