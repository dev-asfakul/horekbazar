// TEST-ONLY: the production build backed by a DISPOSABLE in-memory MongoDB replica set, for the
// signed-in admin journeys in tests/e2e-db (playwright.db.config.ts). Never touches a real database:
// the URI is always the one mongodb-memory-server just created, and the database is `e2e_admin_dev`
// (a `_dev` name, so the sample rules behave as in development). Writes the URI for the test process
// and its throwaway secret to test-results/e2e-db.json (gitignored) and removes it on exit.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const port = String(process.env.E2E_DB_PORT ?? 3200);
const dbName = "e2e_admin_dev";
const infoFile = "test-results/e2e-db.json";

const replSet = await MongoMemoryReplSet.create({ binary: { version: process.env.MONGOMS_VERSION ?? "8.0.4" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
const uri = replSet.getUri();
const env = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  PORT: port,
  HOSTNAME: "127.0.0.1",
  MONGODB_URI: uri,
  MONGODB_DB: dbName,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
};
// Asynchronous on purpose: a synchronous child would block this process, which must keep reading
// the in-memory mongod's output (a full pipe stalls mongod and the migration with it).
const migrated = await new Promise((resolve) => {
  const m = spawn(process.execPath, ["scripts/db-migrate.ts"], { env, stdio: ["ignore", "ignore", "inherit"] });
  m.on("exit", (code) => resolve(code ?? 1));
});
if (migrated !== 0) {
  await replSet.stop();
  process.exit(Number(migrated));
}
mkdirSync("test-results", { recursive: true });
// The throwaway AUTH_SECRET is shared with the test process so it can mint a session cookie (sign-in
// through the UI needs Upstash in production: limited operations fail closed by design).
writeFileSync(infoFile, JSON.stringify({ uri, dbName, authSecret: env.AUTH_SECRET, baseURL: env.NEXT_PUBLIC_SITE_URL }), { mode: 0o600 });

const child = spawn(process.execPath, ["scripts/start-standalone.mjs"], { env, stdio: "inherit" });
const stop = async (code) => {
  rmSync(infoFile, { force: true });
  await replSet.stop();
  process.exit(code);
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => void stop(code ?? 0));
