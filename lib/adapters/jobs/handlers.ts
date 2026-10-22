// Outbox handlers by job type (domain-rules §13). Each handler is idempotent, passes the row's
// idempotencyKey to providers that support one, and returns only after the provider has *accepted*
// the request. B3 adds e-mail; cache purge and search reindex arrive in B4/B5; B8 adds courier
// booking and status sync; push arrives in B9. A row whose type has no handler is retried, then dead-lettered.
import type { OutboxHandler } from "../../modules/platform/outbox.ts";
import { EMAIL_TEMPLATES, renderEmail, type EmailPayload } from "../../modules/identity/emails.ts";
import { emailConfig, sendEmail } from "../email/resend.ts";
import { COURIER_BOOK_JOB, COURIER_SYNC_JOB } from "../../modules/fulfilment/schema.ts";
import { runCourierBooking, runCourierSync } from "../../modules/fulfilment/courier-jobs.ts";

export const EMAIL_JOB = "email.send";

function parseEmailPayload(payload: Record<string, unknown>): EmailPayload {
  const { template, to, locale } = payload;
  if (typeof template !== "string" || !(EMAIL_TEMPLATES as readonly string[]).includes(template)) throw new Error("email job: unknown template");
  if (typeof to !== "string" || !to.includes("@")) throw new Error("email job: missing recipient");
  const text = (key: string) => (typeof payload[key] === "string" ? { [key]: payload[key] as string } : {});
  return { template: template as EmailPayload["template"], to, locale: locale === "en" ? "en" : "bn", ...text("name"), ...text("url"), ...text("storeName"), ...text("role"), ...text("orderNumber"), ...text("total"), ...text("status"), ...text("reason") };
}

export const outboxHandlers: Record<string, OutboxHandler> = {
  [EMAIL_JOB]: async (job) => {
    const config = emailConfig();
    // Not configured: the row is retried and then dead-lettered, never marked sent.
    if (!config) throw new Error("email is not configured (RESEND_API_KEY, EMAIL_FROM)");
    const providerRef = await sendEmail(config, renderEmail(parseEmailPayload(job.payload)), job.idempotencyKey);
    return { providerRef };
  },
  // B8: book a parcel with the courier, and read a consignment's status from the courier's API.
  [COURIER_BOOK_JOB]: (job, ctx) => runCourierBooking(ctx.db, job),
  [COURIER_SYNC_JOB]: (job, ctx) => runCourierSync(ctx.db, job),
};
