// Browser side of web push, shared by the account settings (PushOptIn) and the order-updates prompt
// after an order (OrderUpdatesPrompt, Phase E). Permission is only ever requested from a button press.
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** This browser's current subscription, or null (none, no worker yet, or an error). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? await reg.pushManager.getSubscription() : null;
}

/** Asks for permission (call from a click), then registers the worker and subscribes. */
export async function subscribeThisBrowser(vapidPublicKey: string): Promise<{ ok: true; subscription: PushSubscription } | { ok: false; permission: NotificationPermission }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, permission };
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
  return { ok: true, subscription };
}

/** The shape savePushSubscriptionAction expects. */
export function subscriptionPayload(subscription: PushSubscription, topics: { orders: boolean; marketing: boolean }, locale: "bn" | "en") {
  const json = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }, topics, locale };
}
