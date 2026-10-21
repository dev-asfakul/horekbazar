import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { MongoClient, type Db } from "mongodb";

/** A fresh database on the disposable replica set, dropped by the returned cleanup. */
export async function freshDb(): Promise<{ client: MongoClient; db: Db; uri: string; dbName: string; cleanup: () => Promise<void> }> {
  const uri = inject("replSetUri");
  const dbName = `t_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const client = await MongoClient.connect(uri, { ignoreUndefined: true });
  const db = client.db(dbName);
  return {
    client,
    db,
    uri,
    dbName,
    cleanup: async () => {
      await db.dropDatabase();
      await client.close();
    },
  };
}
