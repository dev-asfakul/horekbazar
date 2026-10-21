// Queues an account e-mail through the outbox and tries to deliver it at once, because the person is
// waiting for it. If the provider is down or not configured, the row stays in the outbox and is retried
// by the drain; the caller learns "queued" and must not tell the person the message was sent.
import type { Db } from "mongodb";
import { randomBytes } from "node:crypto";
import { EMAIL_JOB, outboxHandlers } from "../../adapters/jobs/handlers.ts";
import { enqueueOutbox, runOutboxJobNow } from "../platform/outbox.ts";
import type { EmailPayload } from "./emails.ts";

export type EmailDelivery = "sent" | "queued";

export async function queueEmail(db: Db, payload: EmailPayload, options: { aggregateId?: string; now?: Date } = {}): Promise<EmailDelivery> {
  const now = options.now ?? new Date();
  const aggregateId = options.aggregateId ?? randomBytes(8).toString("hex");
  const { idempotencyKey } = await enqueueOutbox(db, { type: EMAIL_JOB, aggregateId, seq: now.getTime(), payload: { ...payload } }, { now });
  const outcome = await runOutboxJobNow(db, idempotencyKey, outboxHandlers, { workerId: `inline-${aggregateId}` });
  return outcome === "done" ? "sent" : "queued";
}
