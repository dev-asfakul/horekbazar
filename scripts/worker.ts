// npm run worker (JOBS_TRIGGER=worker, domain-rules §13): a separate long-running process that
// drains the outbox every few seconds. Leases make several instances safe. Stops cleanly on
// SIGINT/SIGTERM after the current batch. Logs counts only, never payloads or configuration values.
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { closeDatabase, DatabaseNotReadyError, getDatabase } from "../lib/adapters/db/client.ts";
import { outboxHandlers } from "../lib/adapters/jobs/handlers.ts";
import { drainOutbox } from "../lib/modules/platform/outbox.ts";

const POLL_MS = 5_000;
const BATCH_BUDGET_MS = 10_000;
const workerId = `worker-${hostname()}-${randomUUID().slice(0, 8)}`;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => (stopping = true));

if (process.env.JOBS_TRIGGER && process.env.JOBS_TRIGGER !== "worker") {
  console.warn(`JOBS_TRIGGER is "${process.env.JOBS_TRIGGER}", not "worker"; draining anyway (leases keep this safe).`);
}
console.log(`${workerId}: started; handlers: ${Object.keys(outboxHandlers).length === 0 ? "none yet" : Object.keys(outboxHandlers).join(", ")}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
while (!stopping) {
  try {
    const db = await getDatabase();
    const r = await drainOutbox(db, outboxHandlers, { workerId, trigger: "worker", budgetMs: BATCH_BUDGET_MS });
    if (r.claimed > 0 || !r.ok) console.log(`${workerId}: claimed ${r.claimed}, done ${r.done}, retried ${r.retried}, dead ${r.dead}${r.ok ? "" : `, error: ${r.error}`}`);
  } catch (error) {
    console.error(`${workerId}: ${error instanceof DatabaseNotReadyError ? error.message : "drain failed"}`);
  }
  for (let waited = 0; waited < POLL_MS && !stopping; waited += 250) await sleep(250);
}
await closeDatabase();
console.log(`${workerId}: stopped`);
