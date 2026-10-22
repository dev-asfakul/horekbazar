"use client";
// Tier: build (B9 part 2). Use-when: /account/notifications, push configured. Avoid-when: anywhere
// else; never prompt for permission on page load. Reduced-motion: no motion. Touch: 44 px controls.
// Browser notifications for this browser only. Permission is requested only after the customer
// presses the button. "Order updates" and "Offers and news" are separate choices; offers start
// unticked. States are written out in words (never colour alone) and announced via role="status".
import { useEffect, useId, useState } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction, type PushActionResult } from "@/lib/actions/notifications";

export interface PushOptInLabels {
  unsupported: string;
  blocked: string;
  off: string;
  on: string;
  orders: string;
  ordersHint: string;
  marketing: string;
  marketingHint: string;
  turnOn: string;
  save: string;
  turnOff: string;
  working: string;
  saved: string;
  turnedOff: string;
  errors: Record<string, string>;
}

type State = "checking" | "unsupported" | "blocked" | "off" | "on";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function PushOptIn({ vapidPublicKey, locale, initialTopics, labels }: { vapidPublicKey: string; locale: "bn" | "en"; initialTopics: { orders: boolean; marketing: boolean } | null; labels: PushOptInLabels }) {
  const id = useId();
  const [state, setState] = useState<State>("checking");
  const [orders, setOrders] = useState(initialTopics?.orders ?? true);
  const [marketing, setMarketing] = useState(initialTopics?.marketing ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported()) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, []);

  const report = (r: PushActionResult, okText: string) => setMessage(r.ok ? { kind: "ok", text: okText } : { kind: "error", text: labels.errors[r.error] ?? labels.errors.try_again ?? "" });

  async function save(subscription: PushSubscription) {
    const json = subscription.toJSON();
    return savePushSubscriptionAction({ endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }, topics: { orders, marketing }, locale });
  }

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
      const r = await save(sub);
      if (r.ok) setState("on");
      else await sub.unsubscribe().catch(() => undefined);
      report(r, labels.saved);
    } catch {
      setMessage({ kind: "error", text: labels.errors.try_again ?? "" });
    } finally {
      setBusy(false);
    }
  }

  async function update() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!sub) {
        setState("off");
        return;
      }
      report(await save(sub), labels.saved);
    } catch {
      setMessage({ kind: "error", text: labels.errors.try_again ?? "" });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        report(await removePushSubscriptionAction({ endpoint }), labels.turnedOff);
      }
      setState("off");
    } catch {
      setMessage({ kind: "error", text: labels.errors.try_again ?? "" });
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return <p className="field-hint">{labels.working}</p>;
  if (state === "unsupported") return <p className="field-hint" data-testid="push-unsupported">{labels.unsupported}</p>;
  if (state === "blocked") return <p className="field-hint" data-testid="push-blocked">{labels.blocked}</p>;

  return (
    <div className="form" data-testid="push-opt-in">
      <p className="account-meta" data-testid="push-state">
        {state === "on" ? labels.on : labels.off}
      </p>
      <div className="field">
        <label htmlFor={`${id}-orders`} className="field-check">
          <input id={`${id}-orders`} className="field-checkbox" type="checkbox" checked={orders} onChange={(e) => setOrders(e.target.checked)} aria-describedby={`${id}-orders-hint`} />
          <span className="field-label">{labels.orders}</span>
        </label>
        <p id={`${id}-orders-hint`} className="field-hint">
          {labels.ordersHint}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-marketing`} className="field-check">
          <input id={`${id}-marketing`} className="field-checkbox" type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} aria-describedby={`${id}-marketing-hint`} data-testid="push-marketing" />
          <span className="field-label">{labels.marketing}</span>
        </label>
        <p id={`${id}-marketing-hint`} className="field-hint">
          {labels.marketingHint}
        </p>
      </div>
      <div className="form-actions">
        {state === "off" ? (
          <button type="button" className="btn btn-primary" onClick={turnOn} disabled={busy || (!orders && !marketing)} data-testid="push-turn-on">
            {busy ? labels.working : labels.turnOn}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={update} disabled={busy || (!orders && !marketing)}>
              {busy ? labels.working : labels.save}
            </button>
            <button type="button" className="btn btn-secondary" onClick={turnOff} disabled={busy}>
              {labels.turnOff}
            </button>
          </>
        )}
      </div>
      <p role="status" className={message?.kind === "error" ? "field-error" : "form-success"} aria-live="polite">
        {message?.text ?? ""}
      </p>
    </div>
  );
}
