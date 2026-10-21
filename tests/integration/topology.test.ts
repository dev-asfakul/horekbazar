// domain-rules §12 startup check: a standalone mongod is refused; a replica set is accepted.
import { afterEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { checkDatabase, closeDatabase, DatabaseNotReadyError, getDatabase } from "@/lib/adapters/db/client";
import { getSetupStatus } from "@/lib/setup/status";

afterEach(async () => closeDatabase());

describe("database topology check", () => {
  it("accepts the replica set", async () => {
    const uri = inject("replSetUri");
    expect(await checkDatabase({ uri, dbName: "t_topology" }, { fresh: true })).toBe("connected");
    const db = await getDatabase({ MONGODB_URI: uri, MONGODB_DB: "t_topology" });
    expect(db.databaseName).toBe("t_topology");
  });

  it("refuses a standalone mongod for database-backed work", async () => {
    const uri = inject("standaloneUri");
    expect(await checkDatabase({ uri, dbName: "t_topology" }, { fresh: true })).toBe("not_replica_set");
    await expect(getDatabase({ MONGODB_URI: uri })).rejects.toBeInstanceOf(DatabaseNotReadyError);
    expect((await getSetupStatus({ MONGODB_URI: uri })).database).toBe("not_replica_set");
  });

  it("reports an unreachable server without leaking the URI", async () => {
    const uri = "mongodb://user:canary-pass@127.0.0.1:1/?serverSelectionTimeoutMS=300&connectTimeoutMS=300";
    const state = await checkDatabase({ uri, dbName: "x" }, { fresh: true });
    expect(state).toBe("unreachable");
    const error = await getDatabase({ MONGODB_URI: uri }).catch((e: unknown) => e);
    expect(String((error as Error).message)).not.toContain("canary-pass");
  });
});
