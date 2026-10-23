// B9 part 2b pure rules: the Gemini adapter (configuration, request shape with the key only in a
// header, error mapping), the draft prompt and answer schema, answer parsing, and the capability
// each new staff action checks.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AiError, aiConfig, DEFAULT_GEMINI_MODEL, generateJson, geminiOrigin, MAX_REPLY_BYTES } from "@/lib/adapters/ai/gemini";
import { draftJsonSchema, draftPrompt, parseDraftAnswer } from "@/lib/modules/ai/drafts";
import { AI_FIELDS } from "@/lib/modules/ai/schema";

const KEY = "test-key-not-real-0123456789";
const GOOGLE = "https://generativelanguage.googleapis.com";
const config = { apiKey: KEY, model: "gemini-3.5-flash-lite", origin: GOOGLE };

function reply(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const answer = (text: string, finishReason = "STOP") => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });
const codeOf = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof AiError ? e.code : String(e)));

describe("Gemini configuration", () => {
  it("is off without a key, uses the default model, and accepts only model-id-shaped overrides", () => {
    expect(aiConfig({})).toBeNull();
    expect(aiConfig({ GEMINI_API_KEY: "  " })).toBeNull();
    expect(aiConfig({ GEMINI_API_KEY: KEY })).toEqual({ apiKey: KEY, model: DEFAULT_GEMINI_MODEL, origin: GOOGLE });
    expect(aiConfig({ GEMINI_API_KEY: KEY, GEMINI_MODEL: "gemini-3.8-flash" })?.model).toBe("gemini-3.8-flash");
    expect(aiConfig({ GEMINI_API_KEY: KEY, GEMINI_MODEL: "../models/x?key=1" })?.model).toBe(DEFAULT_GEMINI_MODEL);
  });
});

describe("Gemini test origin", () => {
  it("is honoured only for a loopback stub, a loopback database and outside Vercel", () => {
    const local = { GEMINI_LOCAL_TEST_ORIGIN: "http://127.0.0.1:4555", MONGODB_URI: "mongodb://127.0.0.1:27017/" };
    expect(geminiOrigin(local)).toBe("http://127.0.0.1:4555");
    expect(geminiOrigin({ ...local, VERCEL: "1" })).toBe(GOOGLE);
    expect(geminiOrigin({ ...local, MONGODB_URI: "mongodb+srv://cluster.example.net/" })).toBe(GOOGLE);
    expect(geminiOrigin({ ...local, GEMINI_LOCAL_TEST_ORIGIN: "https://attacker.example" })).toBe(GOOGLE);
    expect(geminiOrigin({ ...local, GEMINI_LOCAL_TEST_ORIGIN: "http://127.0.0.1:4555@attacker.example" })).toBe(GOOGLE);
    expect(geminiOrigin({})).toBe(GOOGLE);
  });
});

describe("Gemini request", () => {
  it("sends the key only in the x-goog-api-key header and asks for JSON matching the schema", async () => {
    const { calls, fetchImpl } = reply(200, answer('{"name":{"bn":"চাল","en":"Rice"}}'));
    const schema = draftJsonSchema(["name"]);
    await expect(generateJson(config, "prompt", schema, { fetchImpl })).resolves.toEqual({ name: { bn: "চাল", en: "Rice" } });
    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(calls[0]!.url).not.toContain(KEY);
    expect(new Headers(calls[0]!.init.headers).get("x-goog-api-key")).toBe(KEY);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", responseJsonSchema: schema });
    expect(String(calls[0]!.init.body)).not.toContain(KEY);
    expect(body.generationConfig.maxOutputTokens).toBe(4096);
    expect(calls[0]!.init.redirect).toBe("error"); // the key never follows a redirect
  });

  it("refuses a reply larger than the cap instead of reading it all", async () => {
    const big = answer(JSON.stringify({ name: { bn: "x".repeat(MAX_REPLY_BYTES), en: "y" } }));
    expect(await codeOf(generateJson(config, "p", {}, reply(200, big) as never))).toBe("ai_bad_output");
    const declared = (async () => new Response("{}", { status: 200, headers: { "content-length": String(MAX_REPLY_BYTES + 1) } })) as unknown as typeof fetch;
    expect(await codeOf(generateJson(config, "p", {}, { fetchImpl: declared }))).toBe("ai_bad_output");
  });

  it("maps provider answers to editor-facing codes without quoting the key", async () => {
    expect(await codeOf(generateJson(config, "p", {}, reply(429, {}) as never))).toBe("ai_busy");
    expect(await codeOf(generateJson(config, "p", {}, reply(403, {}) as never))).toBe("ai_key_rejected");
    expect(await codeOf(generateJson(config, "p", {}, reply(500, {}) as never))).toBe("ai_unavailable");
    expect(await codeOf(generateJson(config, "p", {}, reply(200, { promptFeedback: { blockReason: "SAFETY" } }) as never))).toBe("ai_refused");
    expect(await codeOf(generateJson(config, "p", {}, reply(200, answer("{}", "SAFETY")) as never))).toBe("ai_refused");
    expect(await codeOf(generateJson(config, "p", {}, reply(200, answer('{"name":', "MAX_TOKENS")) as never))).toBe("ai_bad_output");
    expect(await codeOf(generateJson(config, "p", {}, reply(200, "not json") as never))).toBe("ai_bad_output");
    const failing = (async () => {
      throw new Error(`network down ${KEY}`);
    }) as unknown as typeof fetch;
    const error = await generateJson(config, "p", {}, { fetchImpl: failing }).catch((e: unknown) => e as Error);
    expect((error as AiError).code).toBe("ai_unavailable");
    expect((error as Error).message).not.toContain(KEY);
  });
});

describe("draft prompt and answer", () => {
  it("states the no-invention rules, the requested fields with their limits, and the facts", () => {
    const prompt = draftPrompt({ name: { bn: "মিনিকেট চাল", en: "Miniket rice" } }, ["name", "seoTitle"], "family pack");
    expect(prompt).toMatch(/Do not invent/);
    expect(prompt).toContain(`name (max ${AI_FIELDS.name})`);
    expect(prompt).toContain(`seoTitle (max ${AI_FIELDS.seoTitle})`);
    expect(prompt).not.toContain("description (max");
    expect(prompt).toContain("family pack");
    expect(prompt).toContain("মিনিকেট চাল");
    const schema = draftJsonSchema(["name"]) as { required: string[]; properties: Record<string, { properties: { bn: { maxLength: number } } }> };
    expect(schema.required).toEqual(["name"]);
    expect(schema.properties.name!.properties.bn.maxLength).toBe(AI_FIELDS.name);
  });

  it("keeps only the requested fields and refuses missing, empty or over-long text", () => {
    expect(parseDraftAnswer({ name: { bn: "চাল", en: "Rice" }, description: { bn: "x", en: "y" } }, ["name"])).toEqual({ name: { bn: "চাল", en: "Rice" } });
    const bad = (a: unknown, f: Parameters<typeof parseDraftAnswer>[1]) => {
      try {
        parseDraftAnswer(a, f);
        return "ok";
      } catch (e) {
        return e instanceof AiError ? e.code : "other";
      }
    };
    expect(bad({ name: { bn: "চাল" } }, ["name"])).toBe("ai_bad_output");
    expect(bad({ name: { bn: "", en: "Rice" } }, ["name"])).toBe("ai_bad_output");
    expect(bad({ seoTitle: { bn: "ক".repeat(71), en: "t" } }, ["seoTitle"])).toBe("ai_bad_output");
    expect(bad({ name: { bn: "চাল", en: "Rice" } }, ["name", "shortDescription"])).toBe("ai_bad_output");
    expect(bad(null, ["name"])).toBe("ai_bad_output");
  });
});

describe("B9 part 2 staff actions", () => {
  it("each checks its own capability on the server", () => {
    const check = (file: string, expected: Record<string, string>) => {
      const bodies = readFileSync(file, "utf8").split(/export async function /).slice(1);
      expect(bodies.map((b) => b.slice(0, b.indexOf("("))).sort()).toEqual(Object.keys(expected).sort());
      for (const b of bodies) expect(b).toContain(`staffContext("${expected[b.slice(0, b.indexOf("("))]}")`);
    };
    check("lib/actions/ai-drafts.ts", { createAiDraftAction: "catalogue.write", applyAiFieldAction: "catalogue.write", discardAiDraftAction: "catalogue.write" });
    check("lib/actions/admin-notifications.ts", { createCampaignAction: "campaigns.send", deleteCampaignAction: "campaigns.send", sendCampaignAction: "campaigns.send" });
  });

  it("drafting and applying refuse without a key, so the controls cannot be reached by posting directly", () => {
    const src = readFileSync("lib/actions/ai-drafts.ts", "utf8");
    const bodies = src.split(/export async function /).slice(1);
    for (const name of ["createAiDraftAction", "applyAiFieldAction"]) expect(bodies.find((b) => b.startsWith(name))).toContain('fail("ai_not_configured")');
    expect(src).toContain("LIMITS.aiDraft");
  });
});
