// Shared result shape for identity forms (server actions with useActionState). Codes are message
// keys under `forms.errors.*` / `forms.success.*`; no server text reaches the page unescaped.
export type FormState =
  | { status: "idle" }
  | { status: "error"; code: string; fields?: Record<string, string>; values?: Record<string, string> }
  | { status: "success"; code: string; data?: Record<string, unknown> };

export const idle: FormState = { status: "idle" };
