"use client";
// Tier: build. Use-when: attaching a rights-recorded image to a product or banner (B4, Cloudinary
// signed upload). Avoid-when: Cloudinary is not configured; the page shows a notice instead.
// Reduced-motion: no motion. Touch: 44 px file control and buttons.
// Flow: the browser asks /api/media/sign (same origin; capability checked on the server) for a
// short-lived signature, uploads the file straight to Cloudinary, then the details form (alt text in
// both languages and where the right to use the image comes from) posts the returned public id to a
// server action, which accepts only ids inside the purpose folder (isOwnPublicId).
import { useState } from "react";
import { ActionForm, type FieldSpec, type FormMessages } from "@/components/forms/ActionForm";
import type { FormState } from "@/lib/actions/form-state";

export interface MediaUploaderLabels {
  file: string;
  fileHint: string;
  uploading: string;
  uploaded: string;
  failed: string;
  notConfigured: string;
  tooLarge: string;
  submit: string;
  pending: string;
}

interface Props {
  purpose: "product" | "banner";
  action: (state: FormState, form: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  fields: FieldSpec[];
  labels: MediaUploaderLabels;
  messages: FormMessages;
  testId?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

export function MediaUploader({ purpose, action, hidden, fields, labels, messages, testId }: Props) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "failed" | "not_configured" | "too_large">("idle");
  const [uploaded, setUploaded] = useState<{ publicId: string; width: number; height: number } | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) return setStatus("too_large");
    setStatus("uploading");
    setUploaded(null);
    try {
      const signed = await fetch("/api/media/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose }) });
      if (signed.status === 503) return setStatus("not_configured");
      if (!signed.ok) return setStatus("failed");
      const s = (await signed.json()) as { uploadUrl: string; apiKey: string; params: Record<string, string | number>; signature: string };
      const body = new FormData();
      body.set("file", file);
      body.set("api_key", s.apiKey);
      body.set("signature", s.signature);
      for (const [k, v] of Object.entries(s.params)) body.set(k, String(v));
      const res = await fetch(s.uploadUrl, { method: "POST", body });
      if (!res.ok) return setStatus("failed");
      const out = (await res.json()) as { public_id?: string; width?: number; height?: number };
      if (!out.public_id) return setStatus("failed");
      setUploaded({ publicId: out.public_id, width: out.width ?? 0, height: out.height ?? 0 });
      setStatus("done");
    } catch {
      setStatus("failed");
    }
  }

  const note = { idle: null, uploading: labels.uploading, done: labels.uploaded, failed: labels.failed, not_configured: labels.notConfigured, too_large: labels.tooLarge }[status];
  return (
    <div className="media-uploader" data-testid={testId}>
      <div className="field">
        <label className="field-label" htmlFor={`${testId ?? purpose}-file`}>
          {labels.file}
        </label>
        <p className="field-hint" id={`${testId ?? purpose}-file-hint`}>
          {labels.fileHint}
        </p>
        <input id={`${testId ?? purpose}-file`} className="field-input" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={`${testId ?? purpose}-file-hint`} onChange={onFile} disabled={status === "uploading"} />
      </div>
      {note ? (
        <p role="status" className={status === "failed" || status === "too_large" || status === "not_configured" ? "field-error" : "field-hint"}>
          {note}
        </p>
      ) : null}
      {uploaded ? (
        <ActionForm
          key={uploaded.publicId}
          action={action}
          hidden={{ ...hidden, publicId: uploaded.publicId, width: String(uploaded.width), height: String(uploaded.height) }}
          fields={fields}
          messages={messages}
          submitLabel={labels.submit}
          pendingLabel={labels.pending}
          layout="grid"
        />
      ) : null}
    </div>
  );
}
