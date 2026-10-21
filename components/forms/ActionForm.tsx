"use client";
// Tier: build. Use-when: any form backed by a server action (identity forms from B3; checkout from B6).
// Avoid-when: a single-button action with no fields (use a plain <form action> with Button).
// Reduced-motion: no motion beyond the shared button press. Touch: 44 px fields and buttons.
// DESIGN.md → Forms: labels above fields; errors in --danger with an icon and text, linked by
// aria-describedby; on a failed submit an error summary appears first and takes focus. Works without
// JavaScript too: the form posts to the server action and the page re-renders with the result.
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/actions/form-state";
import { idle } from "@/lib/actions/form-state";

export interface FieldSpec {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "tel" | "select" | "otp";
  autoComplete?: string;
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  inputMode?: "numeric" | "tel" | "email" | "text";
}

export interface FormMessages {
  summary: string;
  showPassword: string;
  hidePassword: string;
  errors: Record<string, string>;
  fieldErrors: Record<string, string>;
  success: Record<string, string>;
}

interface Props {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: FieldSpec[];
  hidden?: Record<string, string>;
  submitLabel: string;
  pendingLabel: string;
  messages: FormMessages;
  variant?: "primary" | "secondary" | "danger";
  /** Replace the form with the success message once the action succeeds. */
  hideOnSuccess?: boolean;
  /** Renders extra content for a success state (for example 2FA enrolment details). */
  renderSuccess?: (state: Extract<FormState, { status: "success" }>) => ReactNode;
  footer?: ReactNode;
  testId?: string;
}

function ErrorIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="field-error-icon">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.2v4.6M8 11.2v.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { show: string; hide: string }) {
  const { show, hide, ...input } = props;
  const [visible, setVisible] = useState(false);
  return (
    <div className="field-password">
      <input {...input} type={visible ? "text" : "password"} />
      <button type="button" className="field-toggle" aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
        {visible ? hide : show}
      </button>
    </div>
  );
}

export function ActionForm({ action, fields, hidden, submitLabel, pendingLabel, messages, variant = "primary", hideOnSuccess, renderSuccess, footer, testId }: Props) {
  const [state, formAction, pending] = useActionState(action, idle);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const id = useId();

  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
    if (state.status === "success" && hideOnSuccess) successRef.current?.focus();
  }, [state, hideOnSuccess]);

  const fieldErrors = state.status === "error" ? (state.fields ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  if (state.status === "success" && hideOnSuccess) {
    return (
      <div className="form-result" data-testid={testId ? `${testId}-success` : undefined}>
        <p ref={successRef} tabIndex={-1} role="status" className="form-success">
          {messages.success[state.code] ?? state.code}
        </p>
        {renderSuccess?.(state)}
      </div>
    );
  }

  return (
    <form action={formAction} className="form" noValidate data-testid={testId}>
      {state.status === "error" ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="form-summary">
          <p className="form-summary-title">
            <ErrorIcon /> {messages.errors[state.code] ?? messages.errors.try_again}
          </p>
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="form-summary-list">
              {Object.entries(fieldErrors).map(([name, code]) => (
                <li key={name}>
                  <a href={`#${id}-${name}`}>{fields.find((f) => f.name === name)?.label}: {messages.fieldErrors[code] ?? code}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.status === "success" ? (
        <p role="status" className="form-success">
          {messages.success[state.code] ?? state.code}
        </p>
      ) : null}
      {state.status === "success" ? renderSuccess?.(state) : null}
      {hidden ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />) : null}
      {fields.map((f) => {
        const inputId = `${id}-${f.name}`;
        const error = fieldErrors[f.name];
        const describedBy = [f.hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null].filter(Boolean).join(" ") || undefined;
        const common = {
          id: inputId,
          name: f.name,
          required: f.required,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
          autoComplete: f.autoComplete,
          className: "field-input",
        } as const;
        return (
          <div className="field" key={f.name} data-invalid={error ? "" : undefined}>
            <label htmlFor={inputId} className="field-label">
              {f.label}
            </label>
            {f.hint ? (
              <p id={`${inputId}-hint`} className="field-hint">
                {f.hint}
              </p>
            ) : null}
            {f.type === "select" ? (
              <select {...common} defaultValue={values[f.name] ?? f.defaultValue}>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "password" ? (
              <PasswordInput {...common} show={messages.showPassword} hide={messages.hidePassword} />
            ) : (
              <input
                {...common}
                type={f.type === "otp" ? "text" : (f.type ?? "text")}
                inputMode={f.type === "otp" ? "numeric" : f.inputMode}
                defaultValue={values[f.name] ?? f.defaultValue}
                {...(f.type === "otp" ? { maxLength: 24, spellCheck: false, autoCapitalize: "off" } : {})}
                {...(f.type === "email" ? { spellCheck: false, autoCapitalize: "off" } : {})}
              />
            )}
            {error ? (
              <p id={`${inputId}-error`} className="field-error">
                <ErrorIcon /> {messages.fieldErrors[error] ?? error}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="form-actions">
        <button type="submit" className={`btn btn-${variant}`} aria-busy={pending || undefined} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {footer}
      </div>
    </form>
  );
}
