import { describe, expect, it } from "vitest";
import { databaseConfig, isTransactionCapable } from "@/lib/adapters/db/client";
import { isAuthorizedBearer } from "@/lib/adapters/jobs/auth";
import { auditDiff, redact, REDACTED, truncateIp } from "@/lib/modules/platform/audit";
import { backoffMs, outboxKey, sanitizeError } from "@/lib/modules/platform/outbox";
import { checkStaffAccess } from "@/lib/platform/access";

describe("database config and topology", () => {
  it("reads MONGODB_URI and MONGODB_DB, defaulting the database name", () => {
    expect(databaseConfig({})).toBeNull();
    expect(databaseConfig({ MONGODB_URI: "postgres://x" })).toBeNull();
    expect(databaseConfig({ MONGODB_URI: "mongodb://h/" })).toEqual({ uri: "mongodb://h/", dbName: "horekbazar" });
    expect(databaseConfig({ MONGODB_URI: "mongodb+srv://h/", MONGODB_DB: "dev_db" })?.dbName).toBe("dev_db");
  });

  it("accepts a replica set member or a mongos router, refuses a standalone", () => {
    expect(isTransactionCapable({ setName: "rs0" })).toBe(true);
    expect(isTransactionCapable({ msg: "isdbgrid" })).toBe(true);
    expect(isTransactionCapable({})).toBe(false);
  });
});

describe("outbox helpers", () => {
  it("builds the deterministic <type>:<aggregateId>:<seq> key", () => {
    expect(outboxKey("email.order_placed", "665f1c", 1)).toBe("email.order_placed:665f1c:1");
  });

  it("backs off exponentially with 50–100 % jitter, capped at one hour", () => {
    expect(backoffMs(1, 0)).toBe(15_000);
    expect(backoffMs(1, 1)).toBe(30_000);
    expect(backoffMs(3, 1)).toBe(120_000);
    expect(backoffMs(20, 1)).toBe(3_600_000);
    for (let a = 1; a < 10; a++) expect(backoffMs(a + 1, 0.5)).toBeGreaterThanOrEqual(backoffMs(a, 0.5));
  });

  it("removes credentials from stored errors", () => {
    const text = sanitizeError(new Error("connect mongodb+srv://user:pa55@cluster0.x.net failed token=abc123 Bearer: xyz"));
    expect(text).not.toContain("pa55");
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("xyz");
  });
});

describe("audit log", () => {
  it("keeps only changed fields and redacts personal and secret fields at any depth", () => {
    const d = auditDiff({ status: "draft", price: 100, phone: "01700000000" }, { status: "active", price: 100, phone: "01800000000", nested: { apiKey: "k" } });
    expect(d.before).toEqual({ status: "draft", phone: REDACTED });
    expect(d.after).toEqual({ status: "active", phone: REDACTED, nested: { apiKey: REDACTED } });
    expect(redact({ name: { bn: "চাল", en: "Rice" } })).toEqual({ name: { bn: "চাল", en: "Rice" } });
  });

  it("truncates IPv4 to /24 and IPv6 to /48", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0");
    expect(truncateIp("::ffff:198.51.100.9")).toBe("198.51.100.0");
    expect(truncateIp("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::");
    expect(truncateIp(undefined)).toBeUndefined();
    expect(truncateIp("not-an-ip")).toBeUndefined();
  });
});

describe("job endpoint bearer check", () => {
  const secret = "0123456789abcdef-secret";
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedBearer(secret, secret)).toBe(false);
    expect(isAuthorizedBearer(null, secret)).toBe(false);
  });
  it("refuses everything when the secret is missing or too short", () => {
    expect(isAuthorizedBearer("Bearer short", "short")).toBe(false);
    expect(isAuthorizedBearer("Bearer x", undefined)).toBe(false);
  });
});

describe("staff access before identity (B3)", () => {
  it("denies platform.read in production builds and opens it only on a development server", () => {
    expect(checkStaffAccess("platform.read", { NODE_ENV: "production" })).toEqual({ allowed: false, capability: "platform.read" });
    expect(checkStaffAccess("platform.read", { NODE_ENV: "test" }).allowed).toBe(false);
    expect(checkStaffAccess("platform.read", { NODE_ENV: "development" })).toEqual({ allowed: true, via: "development_server" });
  });
});
