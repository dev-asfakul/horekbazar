// Email port, Resend adapter (BUILD-PLAN §11: "Email: send(template, to, data) → Resend").
// Called only by the outbox handler, so every send is retried with backoff and the idempotency key
// stops Resend from delivering the same message twice. Never logs the API key or the message body.
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailConfig {
  apiKey: string;
  from: string;
}

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

export class EmailSendError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`email provider rejected the message (HTTP ${status}${detail ? `: ${detail}` : ""})`);
    this.name = "EmailSendError";
    this.status = status;
  }
}

/** Sends one message. Resolves to the provider's message id (stored as the outbox providerRef). */
export async function sendEmail(config: EmailConfig, message: EmailMessage, idempotencyKey: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.slice(0, 256) },
    body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
  if (!response.ok || !body.id) throw new EmailSendError(response.status, String(body.name ?? body.message ?? "").slice(0, 120));
  return body.id;
}
