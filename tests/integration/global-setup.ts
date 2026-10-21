// Starts one disposable single-node replica set (WiredTiger, so transactions work) and one standalone
// mongod (to prove the standalone refusal). Each test file uses its own database name.
// MongoDB 8.0 matches current Atlas clusters. MONGOMS_DISTRO can be set on hosts the package does not
// recognise (for example MONGOMS_DISTRO=ubuntu-24.04 on newer Ubuntu releases).
import type { TestProject } from "vitest/node";
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";

const binary = { version: process.env.MONGOMS_VERSION ?? "8.0.4" };

export default async function setup(project: TestProject) {
  const replSet = await MongoMemoryReplSet.create({ binary, replSet: { count: 1, storageEngine: "wiredTiger" } });
  const standalone = await MongoMemoryServer.create({ binary });
  project.provide("replSetUri", replSet.getUri());
  project.provide("standaloneUri", standalone.getUri());
  return async () => {
    await standalone.stop();
    await replSet.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    replSetUri: string;
    standaloneUri: string;
  }
}
