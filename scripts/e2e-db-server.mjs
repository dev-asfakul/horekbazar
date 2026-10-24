// TEST-ONLY: the production build backed by a DISPOSABLE in-memory MongoDB replica set, for the
// signed-in admin journeys in tests/e2e-db (playwright.db.config.ts). Never touches a real database:
// the URI is always the one mongodb-memory-server just created, and the database is `e2e_admin_dev`
// (a `_dev` name, so the sample rules behave as in development). Writes the URI for the test process
// and its throwaway secret to test-results/e2e-db.json (gitignored) and removes it on exit.
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const port = String(process.env.E2E_DB_PORT ?? 3200);
const GEMINI_STUB_KEY = "e2e-gemini-stub-key";
const dbName = "e2e_admin_dev";
const infoFile = "test-results/e2e-db.json";

const replSet = await MongoMemoryReplSet.create({ binary: { version: process.env.MONGOMS_VERSION ?? "8.0.4" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
const uri = replSet.getUri();
const gemini = await startGeminiStub();
// Only the process basics are inherited, so no developer variable (.env.local is not read) reaches
// the server: it is the zero-variable build plus the disposable database.
const inherited = Object.fromEntries(["PATH", "HOME"].map((k) => [k, process.env[k] ?? ""]));
const env = {
  ...inherited,
  PORT: port,
  HOSTNAME: "127.0.0.1",
  MONGODB_URI: uri,
  MONGODB_DB: dbName,
  AUTH_SECRET: randomBytes(32).toString("hex"),
  NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
  // In-process rate limits for this loopback-only test server (lib/adapters/cache/rate-limit.ts).
  RATE_LIMIT_LOCAL_TEST: "1",
  // The specs seed this database from the test process, which cannot clear the server's public-data
  // cache (docs/CACHE-INVENTORY.md §4), so this loopback-only server reads public data live
  // (lib/storefront/cache-switch.ts). Cache behaviour is covered by tests/unit and tests/integration
  // public-cache tests.
  PUBLIC_CACHE_LOCAL_TEST_OFF: "1",
  // Throwaway VAPID keys made for this run, so the notification pages render (B9 part 2). Nothing is
  // ever delivered: this server runs no outbox worker.
  ...vapidKeys(),
  // AI drafts (B9 part 2b) answered by the local stub below, never by Google. The origin override is
  // honoured only for a loopback database outside Vercel (lib/adapters/ai/gemini.ts).
  GEMINI_API_KEY: GEMINI_STUB_KEY,
  GEMINI_LOCAL_TEST_ORIGIN: `http://127.0.0.1:${gemini.address().port}`,
};

// A stand-in for Gemini's generateContent: answers every requested field in both languages. The
// editor's instructions steer it so the journeys can see Gemini's failures: "E2E-GEMINI-BUSY" gets
// 429, "E2E-GEMINI-GARBAGE" an answer that is not JSON.
function startGeminiStub() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.method !== "POST" || req.headers["x-goog-api-key"] !== GEMINI_STUB_KEY) return res.writeHead(403).end();
        const body = JSON.parse(raw);
        const prompt = body.contents?.[0]?.parts?.[0]?.text ?? "";
        if (prompt.includes("E2E-GEMINI-BUSY")) return res.writeHead(429).end();
        const fields = body.generationConfig?.responseJsonSchema?.required ?? [];
        const text = prompt.includes("E2E-GEMINI-GARBAGE") ? "this is not json" : JSON.stringify(Object.fromEntries(fields.map((f) => [f, { bn: `খসড়া ${f}`, en: `Draft ${f}` }])));
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function vapidKeys() {
  const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
  return { NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: "mailto:e2e@example.test" };
}
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
