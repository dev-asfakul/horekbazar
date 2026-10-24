"use client";
// @motomation-component
// id: quantity-stepper · name: QuantityStepper · family: commerce · tier: 1 · deps: none
// what: a compact "− n +" quantity control with a typed field, shared by the product page and the cart.
// use-when: any place a shopper picks a whole-number quantity with a known minimum and maximum.
// avoid-when: product cards (QuickAdd keeps its own add-first "+" control).
// reduced-motion: no motion; only the shared button press, which is off under reduced motion.
// touch: 44 px buttons and field. a11y: role="group" with a name; each button has a name; the field
// is labelled; buttons that cannot act are disabled; out-of-range typing is corrected on blur.
//
// Controlled: the parent owns the value and decides what a change does (keep it for a form, or send
// it to the server). The buttons start disabled and are enabled after hydration, so without
// JavaScript they never look usable; the field still works with a plain form post.
import { useId, useState } from "react";
import { useHydrated } from "@/components/shell/use-browser-state";

export interface QuantityStepperLabels {
  quantity: string;
  decrease: string;
  increase: string;
}

interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Called when a typed value is committed (blur or Enter) instead of on every key. */
  onCommit?: (next: number) => void;
  labels: QuantityStepperLabels;
  name?: string;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
  testId?: string;
}

const BN = "০১২৩৪৫৬৭৮৯";
/** Latin and Bengali digits only; anything else is dropped. */
export const digitsOnly = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN.indexOf(d))).replace(/[^0-9]/g, "").slice(0, 3);
export const clampQty = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), Math.max(min, max)) : min);

export function QuantityStepper({ value, min, max, onChange, onCommit, labels, name, disabled, busy, id, testId }: Props) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-qty`;
  const ready = useHydrated();
  const [draft, setDraft] = useState<string | null>(null);

  const off = disabled || !ready;
  const commit = (raw: string) => {
    setDraft(null);
    const typed = digitsOnly(raw);
    const next = clampQty(typed === "" ? value : Number(typed), min, max);
    if (next !== value) (onCommit ?? onChange)(next);
  };

  return (
    <div className="qty-stepper" aria-busy={busy || undefined} data-testid={testId}>
      <button type="button" className="qty-stepper-btn" onClick={() => onChange(clampQty(value - 1, min, max))} disabled={off || value <= min}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span className="sr-only">{labels.decrease}</span>
      </button>
      <label className="sr-only" htmlFor={inputId}>
        {labels.quantity}
      </label>
      <input
        id={inputId}
        className="qty-stepper-input"
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={3}
        value={draft ?? String(value)}
        disabled={disabled}
        onChange={(e) => setDraft(digitsOnly(e.target.value))}
        onBlur={(e) => (draft !== null ? commit(e.target.value) : undefined)}
        onKeyDown={(e) => {
          // Enter commits a typed value; with nothing typed it submits the form as usual.
          if (e.key === "Enter" && ready && draft !== null) {
            e.preventDefault();
            commit(e.currentTarget.value);
          } else if (e.key === "ArrowUp" && ready) {
            e.preventDefault();
            onChange(clampQty(value + 1, min, max));
          } else if (e.key === "ArrowDown" && ready) {
            e.preventDefault();
            onChange(clampQty(value - 1, min, max));
          }
        }}
      />
      <button type="button" className="qty-stepper-btn" onClick={() => onChange(clampQty(value + 1, min, max))} disabled={off || value >= max}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span className="sr-only">{labels.increase}</span>
      </button>
    </div>
  );
}
