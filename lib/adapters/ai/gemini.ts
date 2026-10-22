// Gemini text adapter (B9 part 2b; domain-rules §7 "ai"). One REST call to `generateContent` with a
// JSON schema for the answer (`responseMimeType` + `responseJsonSchema`, checked against the live API
// on 2026-10-23). Plain fetch instead of the @google/genai SDK named in DESIGN.md: one endpoint does
// not justify the dependency (recorded in the Decision trace). Server-only: the key travels in the
// `x-goog-api-key` header, never in a URL, a log line or an error message.

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface AiConfig {
  apiKey: string;
  model: string;
}

/** The AI integration, or null when GEMINI_API_KEY is unset (every AI control is then hidden). */
export function aiConfig(
  env: Record<string, string | undefined> = process.env,
): AiConfig | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.GEMINI_MODEL?.trim();
  return {
    apiKey,
    model:
      model && /^[a-z0-9][a-z0-9.-]{2,79}$/.test(model)
        ? model
        : DEFAULT_GEMINI_MODEL,
  };
}

/** Why a request produced no usable answer; the code is shown to the editor, never the raw reply. */
export type AiErrorCode =
  | "ai_unavailable"
  | "ai_busy"
  | "ai_refused"
  | "ai_bad_output"
  | "ai_key_rejected";

// Plain fields, not constructor parameter properties: CLI scripts run this file under Node's type
// stripping, which does not support them (same as CatalogueError).
export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AiError";
    this.code = code;
  }
}

export interface GenerateOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  temperature?: number;
}

/** Ask the model for one JSON object matching `schema`; returns the parsed object (not yet validated). */
export async function generateJson(
  config: AiConfig,
  prompt: string,
  schema: Record<string, unknown>,
  options: GenerateOptions = {},
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(
      `${ENDPOINT}/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            temperature: options.temperature ?? 0.4,
          },
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        cache: "no-store",
      },
    );
  } catch {
    throw new AiError("ai_unavailable", "request failed or timed out");
  }
  if (res.status === 429)
    throw new AiError("ai_busy", "rate limited by Gemini");
  if (res.status === 401 || res.status === 403)
    throw new AiError("ai_key_rejected", `Gemini answered ${res.status}`);
  if (res.status === 400)
    throw new AiError(
      "ai_unavailable",
      "Gemini answered 400 (model or request not accepted)",
    );
  if (!res.ok)
    throw new AiError("ai_unavailable", `Gemini answered ${res.status}`);
  let body: {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new AiError("ai_bad_output", "reply was not JSON");
  }
  if (body.promptFeedback?.blockReason)
    throw new AiError(
      "ai_refused",
      body.promptFeedback.blockReason.slice(0, 40),
    );
  const candidate = body.candidates?.[0];
  if (!candidate) throw new AiError("ai_refused", "no answer");
  if (
    candidate.finishReason &&
    !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)
  )
    throw new AiError("ai_refused", candidate.finishReason.slice(0, 40));
  const text = (candidate.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError(
      "ai_bad_output",
      candidate.finishReason === "MAX_TOKENS"
        ? "answer cut off"
        : "answer was not JSON",
    );
  }
}
