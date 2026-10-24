"use client";
// Cart line quantity (Phase B). The shared stepper shows the new quantity at once; the change is
// sent as an absolute quantity after a short pause, so a burst of clicks becomes one request and a
// late reply can never add a step twice. useActionState runs the requests one after another; the
// last one wins. When a reply refuses the change (stock, limits) the stepper returns to the server's
// quantity and says why. Totals are never computed here: the page re-renders from the server's
// re-priced cart, and while a change is on its way the totals are marked as updating (CartPending).
//
// Minimum is 1: "−" stops at 1 and removing a line is the separate Remove button, so a line is never
// removed by accident. Without JavaScript the field and the Update button post the same action.
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { QuantityStepper, type QuantityStepperLabels } from "@/components/commerce/QuantityStepper";
import { useCartPendingReporter } from "@/components/commerce/CartPending";
import { useHydrated } from "@/components/shell/use-browser-state";
import { setCartQuantityAction } from "@/lib/actions/cart";
import { idle, type FormState } from "@/lib/actions/form-state";
import { MAX_LINE_QTY } from "@/lib/modules/pricing/limits";

const DELAY_MS = 350;

interface Props {
  variantId: string;
  quantity: number;
  available: number;
  labels: QuantityStepperLabels & { update: string; updating: string };
  errors: Record<string, string>;
}

export function CartLineQuantity({ variantId, quantity, available, labels, errors }: Props) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(setCartQuantityAction, idle);
  const [target, setTarget] = useState(quantity);
  const [waiting, setWaiting] = useState(false);
  const enhanced = useHydrated();
  const timer = useRef<number | null>(null);
  const max = Math.min(MAX_LINE_QTY, Math.max(available, 1, quantity));
  const canGrowTo = Math.min(MAX_LINE_QTY, Math.max(available, 1));
  const busy = pending || waiting;

  useEffect(() => () => (timer.current ? window.clearTimeout(timer.current) : undefined), []);
  useCartPendingReporter(variantId, busy);

  // The server's quantity wins whenever nothing of ours is still on its way, including after a
  // refused change (the reply ends the request, so the stepper returns to the server's quantity).
  // Adjusted during render rather than in an effect, so there is no extra frame with a stale value.
  const [seen, setSeen] = useState({ quantity, busy });
  if (seen.quantity !== quantity || seen.busy !== busy) {
    setSeen({ quantity, busy });
    if (!busy && target !== quantity) setTarget(quantity);
  }

  const send = (next: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    setWaiting(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (next === quantity && !pending) {
        setWaiting(false);
        return;
      }
      const form = new FormData();
      form.set("variantId", variantId);
      form.set("quantity", String(next));
      // "waiting" ends in the same transition that starts the request, so busy never blinks off.
      startTransition(() => {
        setWaiting(false);
        dispatch(form);
      });
    }, DELAY_MS);
  };

  const change = (next: number) => {
    // Growing past what is in stock is not offered; shrinking an over-stock line always is.
    const capped = next > target ? Math.min(next, canGrowTo) : next;
    if (capped === target) return;
    setTarget(capped);
    send(capped);
  };

  const error = state.status === "error" ? (errors[state.code] ?? errors.try_again) : null;
  return (
    <form action={dispatch} className="cart-qty" data-testid="cart-qty" data-pending={busy ? "" : undefined}>
      <input type="hidden" name="variantId" value={variantId} />
      <QuantityStepper name="quantity" value={target} min={1} max={max} onChange={change} labels={labels} busy={busy} />
      {enhanced ? null : (
        <button type="submit" className="btn btn-secondary">
          {labels.update}
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {busy ? labels.updating : ""}
      </span>
      {error ? (
        <p className="field-error cart-qty-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
