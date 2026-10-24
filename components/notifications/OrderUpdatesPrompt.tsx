"use client";
// Tier: build (Phase E). Use-when: the order success page, push configured, signed-in customer.
// Avoid-when: page load prompts anywhere; guests (push subscriptions belong to an account).
// After an order, offers browser notifications for order updates in one tap. The browser's
// permission dialog opens only from the button. Shown only when this browser supports push, has
// not blocked it, has no subscription yet and has not been told "Not now" before (kept in this
// browser). Offers and news stay off; they can be chosen in Account › Notifications.
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { currentSubscription, pushSupported, subscribeThisBrowser, subscriptionPayload } from "@/components/notifications/push-client";
import { notifyStored, useStoredString } from "@/components/shell/use-browser-state";
import { savePushSubscriptionAction } from "@/lib/actions/notifications";

export const PROMPT_KEY = "hb-order-updates-prompt";

export interface OrderUpdatesLabels {
  title: string;
  body: string;
  turnOn: string;
  notNow: string;
  working: string;
  on: string;
  blocked: string;
  settings: string;
  error: string;
}

type State = "checking" | "hidden" | "offer" | "working" | "on" | "blocked";

export function OrderUpdatesPrompt({ vapidPublicKey, locale, settingsHref, labels }: { vapidPublicKey: string; locale: "bn" | "en"; settingsHref: string; labels: OrderUpdatesLabels }) {
  const id = useId();
  const dismissed = useStoredString(PROMPT_KEY) === "dismissed";
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported() || Notification.permission === "denied") return !cancelled && setState("hidden");
      const sub = await currentSubscription();
      if (!cancelled) setState(sub ? "hidden" : "offer");
    })().catch(() => !cancelled && setState("hidden"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setState("working");
    setError(false);
    try {
      const result = await subscribeThisBrowser(vapidPublicKey);
      if (!result.ok) {
        setState(result.permission === "denied" ? "blocked" : "offer");
        return;
      }
      const saved = await savePushSubscriptionAction(subscriptionPayload(result.subscription, { orders: true, marketing: false }, locale));
      if (saved.ok) setState("on");
      else {
        await result.subscription.unsubscribe().catch(() => undefined);
        setError(true);
        setState("offer");
      }
    } catch {
      setError(true);
      setState("offer");
    }
  }

  function notNow() {
    try {
      window.localStorage.setItem(PROMPT_KEY, "dismissed");
    } catch {
      // Storage blocked: the prompt simply closes for this page view.
      setState("hidden");
    }
    notifyStored();
  }

  if (state === "checking" || state === "hidden") return null;
  if (dismissed && state === "offer") return null;

  return (
    <section className="cart-summary order-updates" aria-labelledby={`${id}-title`} data-testid="order-updates">
      <h2 id={`${id}-title`} className="account-section-title">
        {labels.title}
      </h2>
      {state === "on" || state === "blocked" ? (
        <p role="status" className={state === "on" ? "form-success" : "field-hint"} data-testid="order-updates-result">
          {state === "on" ? labels.on : labels.blocked}{" "}
          <Link href={settingsHref}>{labels.settings}</Link>
        </p>
      ) : (
        <>
          <p className="field-hint">{labels.body}</p>
          <p className="cart-line-actions">
            <button type="button" className="btn btn-primary" onClick={turnOn} disabled={state === "working"} data-testid="order-updates-on">
              {state === "working" ? labels.working : labels.turnOn}
            </button>
            <button type="button" className="btn btn-secondary" onClick={notNow} disabled={state === "working"}>
              {labels.notNow}
            </button>
          </p>
          <p role="status" className="field-error" aria-live="polite">
            {error ? labels.error : ""}
          </p>
        </>
      )}
    </section>
  );
}
