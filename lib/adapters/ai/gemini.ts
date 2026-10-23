// Gemini text adapter (B9 part 2b; domain-rules §7 "ai"). One REST call to `generateContent` with a
// JSON schema for the answer (`responseMimeType` + `responseJsonSchema`, checked against the live API
// on 2026-10-23). Plain fetch instead of the @google/genai SDK named in DESIGN.md: one endpoint does
// not justify the dependency (recorded in the Decision trace). Server-only: the key travels in the
// `x-goog-api-key` header, never in a URL, a log line or an error message.

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com";
/** Longest reply read from Gemini; a draft is at most ~11 KB of text, so this only stops a runaway body. */
export const MAX_REPLY_BYTES = 256 * 1024;
/** Output token cap per draft: enough for every field in both languages, bounded for cost and size. */
const MAX_OUTPUT_TOKENS = 4096;

export interface AiConfig {
  apiKey: string;
  model: string;
  /** Where requests go; always Google except for the loopback-only test server (see geminiOrigin). */
  origin: string;
}

type Env = Record<string, string | undefined>;

/**
 * TEST-ONLY override for the signed-in browser journeys (scripts/e2e-db-server.mjs), which answer
 * from a local stub instead of Google. Honoured only when the database is on the loopback interface,
 * the app is not on Vercel and the stub itself is on 127.0.0.1 — no deployment can meet all three
 * (same rule as RATE_LIMIT_LOCAL_TEST in lib/adapters/cache/rate-limit.ts).
 */
export function geminiOrigin(env: Env = process.env): string {
  const local = env.GEMINI_LOCAL_TEST_ORIGIN;
  if (local && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(local) && /^mongodb:\/\/127\.0\.0\.1:\d+\//.test(env.MONGODB_URI ?? "") && !env.VERCEL) return local;
  return GEMINI_ORIGIN;
}

/** The AI integration, or null when GEMINI_API_KEY is unset (every AI control is then hidden). */
export function aiConfig(env: Env = process.env): AiConfig | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.GEMINI_MODEL?.trim();
  return { apiKey, model: model && /^[a-z0-9][a-z0-9.-]{2,79}$/.test(model) ? model : DEFAULT_GEMINI_MODEL, origin: geminiOrigin(env) };
}

/** Why a request produced no usable answer; the code is shown to the editor, never the raw reply. */
export type AiErrorCode = "ai_unavailable" | "ai_busy" | "ai_refused" | "ai_bad_output" | "ai_key_rejected";

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

/** Reads at most MAX_REPLY_BYTES of the body; a longer reply is refused, not truncated. */
async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_REPLY_BYTES) throw new AiError("ai_bad_output", "reply too large");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REPLY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new AiError("ai_bad_output", "reply too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Ask the model for one JSON object matching `schema`; returns the parsed object (not yet validated). */
export async function generateJson(config: AiConfig, prompt: string, schema: Record<string, unknown>, options: GenerateOptions = {}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${config.origin}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: options.temperature ?? 0.4, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      // The key must never follow a redirect to another host.
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      cache: "no-store",
    });
  } catch {
    throw new AiError("ai_unavailable", "request failed or timed out");
  }
  if (res.status === 429) throw new AiError("ai_busy", "rate limited by Gemini");
  if (res.status === 401 || res.status === 403) throw new AiError("ai_key_rejected", `Gemini answered ${res.status}`);
  if (res.status === 400) throw new AiError("ai_unavailable", "Gemini answered 400 (model or request not accepted)");
  if (!res.ok) throw new AiError("ai_unavailable", `Gemini answered ${res.status}`);
  let body: { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  try {
    body = JSON.parse(await readCapped(res)) as typeof body;
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError("ai_bad_output", "reply was not JSON");
  }
  if (body.promptFeedback?.blockReason) throw new AiError("ai_refused", String(body.promptFeedback.blockReason).slice(0, 40));
  const candidate = body.candidates?.[0];
  if (!candidate) throw new AiError("ai_refused", "no answer");
  if (candidate.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) throw new AiError("ai_refused", String(candidate.finishReason).slice(0, 40));
  const text = (candidate.content?.parts ?? []).map((p) => (typeof p.text === "string" ? p.text : "")).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("ai_bad_output", candidate.finishReason === "MAX_TOKENS" ? "answer cut off" : "answer was not JSON");
  }
}
