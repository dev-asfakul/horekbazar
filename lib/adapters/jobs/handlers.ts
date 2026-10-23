// Outbox handlers by job type (domain-rules §13). Each handler is idempotent, passes the row's
// idempotencyKey to providers that support one, and returns only after the provider has *accepted*
// the request. B3 adds e-mail; cache purge and search reindex arrive in B4/B5; B8 adds courier
// booking and status sync; B9 adds push messages and the e-mail log. A row whose type has no handler is
// retried, then dead-lettered.
import type { OutboxHandler } from "../../modules/platform/outbox.ts";
import { EMAIL_TEMPLATES, renderEmail, type EmailPayload } from "../../modules/identity/emails.ts";
import { emailConfig, sendEmail } from "../email/resend.ts";
import { COURIER_BOOK_JOB, COURIER_SYNC_JOB } from "../../modules/fulfilment/schema.ts";
import { runCourierBooking, runCourierSync } from "../../modules/fulfilment/courier-jobs.ts";
import { PUSH_JOB } from "../../modules/notifications/schema.ts";
import { recordEmailAttempt, runPushJob } from "../../modules/notifications/notifications.ts";

export const EMAIL_JOB = "email.send";

function parseEmailPayload(payload: Record<string, unknown>): EmailPayload {
  const { template, to, locale } = payload;
  if (typeof template !== "string" || !(EMAIL_TEMPLATES as readonly string[]).includes(template)) throw new Error("email job: unknown template");
  if (typeof to !== "string" || !to.includes("@")) throw new Error("email job: missing recipient");
  const text = (key: string) => (typeof payload[key] === "string" ? { [key]: payload[key] as string } : {});
  return { template: template as EmailPayload["template"], to, locale: locale === "en" ? "en" : "bn", ...text("name"), ...text("url"), ...text("storeName"), ...text("role"), ...text("orderNumber"), ...text("total"), ...text("status"), ...text("reason") };
}

export const outboxHandlers: Record<string, OutboxHandler> = {
  [EMAIL_JOB]: async (job, ctx) => {
    const payload = parseEmailPayload(job.payload);
    // Every attempt is logged (masked address, keyed hash); a logging failure never blocks the send.
    const log = (entry: { status: "sent" | "failed"; providerId?: string; error?: string }) =>
      recordEmailAttempt(ctx.db, { outboxKey: job.idempotencyKey, to: payload.to, template: payload.template, ...entry }).catch(() => undefined);
    const config = emailConfig();
    // Not configured: the row is retried and then dead-lettered, never marked sent.
    if (!config) {
      await log({ status: "failed", error: "email is not configured" });
      throw new Error("email is not configured (RESEND_API_KEY, EMAIL_FROM)");
    }
    try {
      const providerRef = await sendEmail(config, renderEmail(payload), job.idempotencyKey);
      await log({ status: "sent", ...(providerRef ? { providerId: providerRef } : {}) });
      return { providerRef };
    } catch (error) {
      await log({ status: "failed", error: error instanceof Error ? error.message.slice(0, 300) : "send failed" });
      throw error;
    }
  },
  // B9: one push message to one browser subscription.
  [PUSH_JOB]: (job, ctx) => runPushJob(ctx.db, job),
  // B8: book a parcel with the courier, and read a consignment's status from the courier's API.
  [COURIER_BOOK_JOB]: (job, ctx) => runCourierBooking(ctx.db, job),
  [COURIER_SYNC_JOB]: (job, ctx) => runCourierSync(ctx.db, job),
};
