// Web Push sender (B9 part 2; DESIGN.md D3: @block65/webcrypto-web-push after the fit check).
// The library encrypts the message (RFC 8291, aes128gcm) and signs the VAPID header (RFC 8292);
// this adapter owns the HTTP call so it can bound the time, read the push service's answer and
// report a subscription that no longer exists (404/410) so the caller removes it.
// Server-only: VAPID_PRIVATE_KEY never reaches the browser.
import { buildPushPayload } from "@block65/webcrypto-web-push";

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** What the browser's service worker receives (public/sw.js). */
export interface PushMessageData {
  title: string;
  body: string;
  /** A path on this site; the service worker refuses anything else. */
  url: string;
  /** Replaces an earlier notification with the same tag (e.g. one per order). */
  tag?: string;
}

export type PushResult =
  { outcome: "accepted"; status: number } | { outcome: "gone"; status: number };

// Plain fields, not constructor parameter properties: CLI scripts run modules under Node's type
// stripping, which does not support them (same as CatalogueError).
export class PushRejectedError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`push service answered ${status}`);
    this.name = "PushRejectedError";
    this.status = status;
  }
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** All three VAPID variables, or null (push opt-in stays hidden). Shape-checked, never logged. */
export function pushConfig(
  env: Record<string, string | undefined> = process.env,
): PushConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  // Uncompressed P-256 public key (65 bytes → 87 chars) and a 32-byte private scalar (43 chars).
  if (
    !B64URL.test(publicKey) ||
    publicKey.length !== 87 ||
    !B64URL.test(privateKey) ||
    privateKey.length !== 43
  )
    return null;
  if (!/^(mailto:.+@.+|https:\/\/.+)$/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/** Topic header: at most 32 URL-safe characters (RFC 8030 §5.4). */
const topicOf = (tag?: string) =>
  tag
    ? tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined
    : undefined;

export async function sendPush(
  config: PushConfig,
  target: PushTarget,
  data: PushMessageData,
  options: {
    ttlSeconds?: number;
    urgency?: "low" | "normal" | "high";
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<PushResult> {
  const topic = topicOf(data.tag);
  const payload = await buildPushPayload(
    {
      data: { ...data },
      options: {
        ttl: options.ttlSeconds ?? 24 * 60 * 60,
        urgency: options.urgency ?? "normal",
        ...(topic ? { topic } : {}),
      },
    },
    { endpoint: target.endpoint, expirationTime: null, keys: target.keys },
    config,
  );
  const res = await (options.fetchImpl ?? fetch)(target.endpoint, {
    method: "POST",
    headers: payload.headers,
    body: payload.body,
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });
  // The response body is not needed; release it.
  await res.body?.cancel().catch(() => undefined);
  if (res.status === 404 || res.status === 410)
    return { outcome: "gone", status: res.status };
  if (res.status >= 200 && res.status < 300)
    return { outcome: "accepted", status: res.status };
  throw new PushRejectedError(res.status);
}
