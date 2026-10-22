// Steadfast Courier adapter (B8; BUILD-PLAN §11 "Courier: book/track → Steadfast"). Thin client for
// the two calls in Steadfast's published API document: POST /create_order and GET /status_by_cid/{id},
// base https://portal.packzy.com/api/v1, headers Api-Key and Secret-Key. Called only from the
// outbox handlers, so every call is retried with backoff and failures stay visible on the job.
// Never logs the keys, the request body or the customer's details.
export const STEADFAST_BASE_URL = "https://portal.packzy.com/api/v1";

export interface SteadfastConfig {
  apiKey: string;
  secretKey: string;
}

export function steadfastConfig(env: Record<string, string | undefined> = process.env): SteadfastConfig | null {
  const apiKey = env.STEADFAST_API_KEY?.trim();
  const secretKey = env.STEADFAST_SECRET_KEY?.trim();
  return apiKey && secretKey ? { apiKey, secretKey } : null;
}

export class CourierRequestError extends Error {
  readonly status: number;
  /** false when retrying cannot help (validation errors): the job fails at once instead of backing off. */
  readonly retryable: boolean;
  constructor(status: number, detail: string, retryable: boolean) {
    super(`courier rejected the request (HTTP ${status}${detail ? `: ${detail}` : ""})`);
    this.name = "CourierRequestError";
    this.status = status;
    this.retryable = retryable;
  }
}

export interface SteadfastBookingInput {
  invoice: string;
  recipientName: string;
  /** 11 digits, 01XXXXXXXXX. */
  recipientPhone: string;
  recipientAddress: string;
  /** Taka, the cash to collect. */
  codAmount: number;
  note?: string | undefined;
}

export interface SteadfastBooking {
  consignmentId: string;
  trackingCode: string | null;
  status: string;
}

const headers = (config: SteadfastConfig) => ({ "Api-Key": config.apiKey, "Secret-Key": config.secretKey, "Content-Type": "application/json", Accept: "application/json" });

/** Field limits from the API document: recipient_name 100, recipient_address 250, note free text. */
export function steadfastBookingProblems(input: SteadfastBookingInput): string[] {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9-]{1,60}$/.test(input.invoice)) problems.push("invoice");
  if (input.recipientName.length === 0 || input.recipientName.length > 100) problems.push("recipient_name");
  if (!/^01\d{9}$/.test(input.recipientPhone)) problems.push("recipient_phone");
  if (input.recipientAddress.length === 0 || input.recipientAddress.length > 250) problems.push("recipient_address");
  if (!Number.isFinite(input.codAmount) || input.codAmount < 0) problems.push("cod_amount");
  return problems;
}

function detailOf(body: Record<string, unknown>): string {
  const message = typeof body.message === "string" ? body.message : "";
  const errors = body.errors && typeof body.errors === "object" ? Object.keys(body.errors as object).join(",") : "";
  return [message, errors].filter(Boolean).join(" ").slice(0, 160);
}

export async function steadfastCreateOrder(config: SteadfastConfig, input: SteadfastBookingInput, fetchImpl: typeof fetch = fetch): Promise<SteadfastBooking> {
  const response = await fetchImpl(`${STEADFAST_BASE_URL}/create_order`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ invoice: input.invoice, recipient_name: input.recipientName, recipient_phone: input.recipientPhone, recipient_address: input.recipientAddress, cod_amount: input.codAmount, ...(input.note ? { note: input.note } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const consignment = (body.consignment ?? null) as Record<string, unknown> | null;
  const id = consignment?.consignment_id;
  if (!response.ok || Number(body.status) !== 200 || (typeof id !== "number" && typeof id !== "string") || String(id).length === 0) {
    const status = response.ok ? Number(body.status) || 422 : response.status;
    // 4xx other than 408/429 is a request the courier will keep refusing.
    throw new CourierRequestError(status, detailOf(body), status >= 500 || status === 408 || status === 429);
  }
  const tracking = consignment?.tracking_code;
  return { consignmentId: String(id), trackingCode: typeof tracking === "string" && tracking ? tracking : null, status: String(consignment?.status ?? "in_review") };
}

/** The courier's current delivery_status for one consignment: the authoritative read for webhooks. */
export async function steadfastStatusByConsignment(config: SteadfastConfig, consignmentId: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(consignmentId)) throw new CourierRequestError(400, "consignment id", false);
  const response = await fetchImpl(`${STEADFAST_BASE_URL}/status_by_cid/${encodeURIComponent(consignmentId)}`, { method: "GET", headers: headers(config), signal: AbortSignal.timeout(10_000) });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || Number(body.status) !== 200 || typeof body.delivery_status !== "string") {
    const status = response.ok ? Number(body.status) || 502 : response.status;
    throw new CourierRequestError(status, detailOf(body), status >= 500 || status === 408 || status === 429);
  }
  return body.delivery_status;
}
