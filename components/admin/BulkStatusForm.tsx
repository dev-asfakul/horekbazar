"use client";
// Tier: build. Use-when: an admin list whose rows can change status together (products, B4).
// Rows carry <input type="checkbox" form={formId} name="item" value="id:version">, so the selection
// posts with the form even without JavaScript; with JavaScript "select all" and a live count work too.
// Result: a status line with the count changed and a list of products not changed, with the reason.
// The controls sit behind a "Select products" disclosure (Proposal A1); it opens by itself once a row
// is ticked, and the result line stays outside it so it is always seen.
import { useActionState, useEffect, useRef, useState } from "react";
import type { FormState } from "@/lib/actions/form-state";
import { idle } from "@/lib/actions/form-state";
import type { FormMessages } from "@/components/forms/ActionForm";

interface Labels {
  legend: string;
  status: string;
  apply: string;
  pending: string;
  selectAll: string;
  clear: string;
  selected: string;
  done: string;
  failed: string;
  hint: string;
  /** Disclosure summary, e.g. "Select products". */
  toggle: string;
}

interface Props {
  formId: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  options: { value: string; label: string }[];
  labels: Labels;
  messages: FormMessages;
  /** id → display name, to name the products that were not changed. */
  names: Record<string, string>;
}

const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));

export function BulkStatusForm({ formId, action, options, labels, messages, names }: Props) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [count, setCount] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  // Only the visible layout's checkboxes count (the hidden layout's boxes are display: none).
  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"]`)).filter((b) => b.offsetParent !== null);

  useEffect(() => {
    const update = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  });

  useEffect(() => {
    if (count > 0 && detailsRef.current) detailsRef.current.open = true;
  }, [count]);

  useEffect(() => {
    if (state.status !== "idle") resultRef.current?.focus();
  }, [state]);

  const setAll = (checked: boolean) => {
    for (const b of boxes()) b.checked = checked;
    setCount(checked ? boxes().length : 0);
  };

  const data = state.status === "success" ? (state.data as { done: number; total: number; failures: { id: string; code: string }[] }) : null;

  return (
    <form id={formId} action={formAction} className="bulk-bar" data-testid="bulk-status-form" aria-busy={pending || undefined}>
      <details ref={detailsRef} className="bulk-details">
        <summary data-testid="bulk-toggle">{labels.toggle}</summary>
        <fieldset className="bulk-fieldset">
          <legend className="field-label">{labels.legend}</legend>
          <p className="field-hint">{labels.hint}</p>
          <div className="bulk-row">
            <button type="button" className="btn btn-secondary" onClick={() => setAll(true)}>
              {labels.selectAll}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAll(false)} disabled={count === 0}>
              {labels.clear}
            </button>
            <span className="admin-meta" aria-live="polite" data-testid="bulk-count">
              {fill(labels.selected, { count })}
            </span>
            <label className="sr-only" htmlFor={`${formId}-status`}>
              {labels.status}
            </label>
            <select id={`${formId}-status`} name="status" className="field-input bulk-select" defaultValue="published">
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? labels.pending : labels.apply}
            </button>
          </div>
        </fieldset>
      </details>
      <div ref={resultRef} tabIndex={-1} data-testid="bulk-result">
        {state.status === "error" ? (
          <p role="alert" className="form-error">
            {messages.errors[state.code] ?? messages.errors.try_again}
          </p>
        ) : null}
        {data ? (
          <div role="status" className={data.failures.length ? "form-error" : "form-success"}>
            <p>{fill(labels.done, { done: data.done, total: data.total })}</p>
            {data.failures.length ? (
              <>
                <p>{labels.failed}</p>
                <ul className="bulk-failures">
                  {data.failures.map((f) => (
                    <li key={f.id}>
                      {names[f.id] ?? f.id}: {messages.errors[f.code] ?? messages.errors.try_again}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
