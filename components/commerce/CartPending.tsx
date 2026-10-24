"use client";
// Cart "updating" signal (Phase B). Quantity controls report a change on its way; CartBusy regions
// (line totals and the summary) are marked aria-busy and dimmed until the server's re-priced cart
// arrives. Nothing here computes a price: the values inside a region are always the server's.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Two contexts: the reporter is stable for the life of the page, so a reporter's effects never
// re-run because the busy set changed (which would loop off/on); only CartBusy reads the set.
type Report = (key: string, on: boolean) => void;
const ReportCtx = createContext<Report | null>(null);
const BusyCtx = createContext<ReadonlySet<string> | null>(null);

export function CartPendingProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback<Report>((key, on) => {
    setBusy((prev) => {
      if (prev.has(key) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  return (
    <ReportCtx.Provider value={report}>
      <BusyCtx.Provider value={busy}>{children}</BusyCtx.Provider>
    </ReportCtx.Provider>
  );
}

export function useCartPendingReporter(key: string, on: boolean) {
  const report = useContext(ReportCtx);
  useEffect(() => {
    if (!report) return;
    report(key, on);
    return () => report(key, false);
  }, [report, key, on]);
}

/** `only` limits the region to one line's changes; without it any pending change marks it. */
export function CartBusy({ only, label, className, children }: { only?: string; label: string; className?: string; children: ReactNode }) {
  const busy = useContext(BusyCtx);
  const on = busy ? (only ? busy.has(only) : busy.size > 0) : false;
  return (
    <div className={className ? `cart-busy ${className}` : "cart-busy"} aria-busy={on || undefined} data-pending={on ? "" : undefined}>
      {children}
      {on ? (
        <p className="cart-busy-note" aria-hidden="true">
          {label}
        </p>
      ) : null}
    </div>
  );
}
