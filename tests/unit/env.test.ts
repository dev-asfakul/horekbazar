import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { getSetupStatus } from "@/lib/setup/status";

describe("parseServerEnv", () => {
  it("accepts an empty environment: every integration is not configured", () => {
    const r = parseServerEnv({});
    expect(r.issues).toEqual([]);
    expect(Object.values(r.integrations).every((s) => s === "not_configured")).toBe(true);
  });

  it("treats the .env.example placeholders (empty values, bare mailto:) as unset", () => {
    const r = parseServerEnv({ MONGODB_URI: "", VAPID_SUBJECT: "mailto:", NEXT_PUBLIC_DEFAULT_LOCALE: "" });
    expect(r.issues).toEqual([]);
    expect(r.integrations.push).toBe("not_configured");
  });

  it("reports an invalid value by name without echoing the value", () => {
    const secret = "postgres://user:hunter2@example.invalid/db";
    const r = parseServerEnv({ MONGODB_URI: secret });
    expect(r.issues.map((i) => i.name)).toContain("MONGODB_URI");
    expect(JSON.stringify(r.issues)).not.toContain("hunter2");
    expect(r.integrations.database).toBe("incomplete");
  });

  it("marks a partially configured integration as incomplete and names what is missing", () => {
    const r = parseServerEnv({ CLOUDINARY_CLOUD_NAME: "demo-cloud" });
    expect(r.integrations.cloudinary).toBe("incomplete");
    expect(r.issues.find((i) => i.name.includes("CLOUDINARY_API_SECRET"))).toBeDefined();
  });

  it("marks a fully configured integration as configured", () => {
    const r = parseServerEnv({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" });
    expect(r.integrations.redis).toBe("configured");
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(parseServerEnv({ AUTH_SECRET: "short" }).issues.map((i) => i.name)).toContain("AUTH_SECRET");
  });
});

describe("getSetupStatus", () => {
  it("requires MONGODB_URI and never connects without it", async () => {
    let called = 0;
    const check = async (config: unknown) => (called++, config === null ? ("not_configured" as const) : ("connected" as const));
    expect(await getSetupStatus({}, check)).toEqual({ ready: false, missing: ["MONGODB_URI"], invalid: [], database: "not_configured" });
    expect(called).toBe(1);
  });

  it("reports the checked database state, and is not ready before settings and an Owner exist", async () => {
    const uri = { MONGODB_URI: "mongodb+srv://cluster.example.invalid/" };
    const configured = await getSetupStatus(uri, async () => "connected", async () => false);
    expect(configured).toEqual({ ready: false, missing: [], invalid: [], database: "connected" });
    // Ready only once the Owner and the saved settings exist; a failing probe is "not ready", never ready.
    expect((await getSetupStatus(uri, async () => "connected", async () => true)).ready).toBe(true);
    expect((await getSetupStatus(uri, async () => "connected", async () => Promise.reject(new Error("x")))).ready).toBe(false);
    expect((await getSetupStatus(uri, async () => "unreachable", async () => true)).ready).toBe(false);
    const standalone = await getSetupStatus({ MONGODB_URI: "mongodb://127.0.0.1:1/" }, async () => "not_replica_set");
    expect(standalone.database).toBe("not_replica_set");
  });

  it("does not try to connect with an invalid URI", async () => {
    const status = await getSetupStatus({ MONGODB_URI: "postgres://nope" }, async () => {
      throw new Error("must not be called");
    });
    expect(status.invalid).toContain("MONGODB_URI");
    expect(status.database).toBe("not_configured");
  });
});
