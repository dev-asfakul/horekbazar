"use client";
// Tier: build. Use-when: a product card whose product has exactly one variant (Checkpoint 2, Q2).
// Avoid-when: products with options (the card links to the product page instead).
// Reduced-motion: the "+" → stepper change is instant. Touch: 44 px buttons.
// QuickAdd: "+" posts the existing addToCartAction (works without JavaScript as a plain form);
// once the variant is in the cart it shows − n +, posting setCartQuantityAction. The quantity
// shown comes from the server's cart after each action (refresh), never from the browser.
import { useActionState, useEffect, useRef } from "react";
import { addToCartAction, setCartQuantityAction } from "@/lib/actions/cart";
import { idle, type FormState } from "@/lib/actions/form-state";

export interface QuickAddLabels {
  add: string;
  increase: string;
  decrease: string;
  inCart: string;
  added: string;
  error: string;
}

function announce(text: string) {
  const live = document.getElementById("live-region");
  if (live) {
    live.textContent = "";
    window.setTimeout(() => (live.textContent = text), 30);
  }
}

export function QuickAdd({ variantId, quantity, quantityText, labels }: { variantId: string; quantity: number; quantityText: string; labels: QuickAddLabels }) {
  const [addState, add, adding] = useActionState<FormState, FormData>(addToCartAction, idle);
  const [setState, set, setting] = useActionState<FormState, FormData>(setCartQuantityAction, idle);
  const last = useRef<FormState>(idle);
  useEffect(() => {
    for (const s of [addState, setState]) {
      if (s === last.current || s.status === "idle") continue;
      last.current = s;
      announce(s.status === "success" ? labels.added : labels.error);
    }
  }, [addState, setState, labels]);
  const busy = adding || setting;

  if (quantity <= 0) {
    return (
      <form action={add} className="quick-add">
        <input type="hidden" name="variantId" value={variantId} />
        <input type="hidden" name="quantity" value="1" />
        <button type="submit" className="quick-add-plus" aria-busy={busy || undefined} disabled={busy}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <span className="sr-only">{labels.add}</span>
        </button>
      </form>
    );
  }
  return (
    <div className="quick-add quick-add-stepper" role="group" aria-label={labels.inCart} aria-busy={busy || undefined}>
      <form action={set}>
        <input type="hidden" name="variantId" value={variantId} />
        <input type="hidden" name="quantity" value={String(quantity - 1)} />
        <button type="submit" className="quick-add-step" disabled={busy}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <span className="sr-only">{labels.decrease}</span>
        </button>
      </form>
      <span className="quick-add-qty" aria-live="polite">
        {quantityText}
      </span>
      <form action={add}>
        <input type="hidden" name="variantId" value={variantId} />
        <input type="hidden" name="quantity" value="1" />
        <button type="submit" className="quick-add-step" disabled={busy}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <span className="sr-only">{labels.increase}</span>
        </button>
      </form>
    </div>
  );
}
