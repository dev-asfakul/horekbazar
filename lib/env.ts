// Server environment schema (Zod). Validates the variables in .env.example without ever
// echoing their values. Each integration is required only by the operation that uses it
// (DESIGN.md §1, conflict 1): a missing optional integration is "not_configured", a
// partially filled one is "incomplete", and only MONGODB_URI gates database-backed pages.
import { z } from "zod";

/** Treat empty strings (and the .env.example "mailto:" placeholder) as unset. */
const optional = (schema: z.ZodString) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() !== "" && v.trim() !== "mailto:" ? v.trim() : undefined), schema.optional());

export const serverEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: optional(z.string().url()),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["bn", "en"]).optional()),
  STORE_TIMEZONE: optional(z.string().min(1)),
  // "on" answers every storefront page with the maintenance state (503). Anything else, or unset, is off.
  MAINTENANCE_MODE: z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : undefined), z.enum(["on", "off"]).optional()),
  // "on" lets search engines crawl the storefront (robots.txt, page robots meta). Off by default: this is
  // a development and showcase deployment until the owner decides to launch.
  SITE_INDEXING: z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : undefined), z.enum(["on", "off"]).optional()),

  MONGODB_URI: optional(z.string().regex(/^mongodb(\+srv)?:\/\/.+/, "must start with mongodb:// or mongodb+srv://")),
  MONGODB_DB: optional(z.string().regex(/^[A-Za-z0-9_-]{1,63}$/, "letters, digits, _ and - only")),

  AUTH_SECRET: optional(z.string().min(32, "at least 32 characters")),
  AUTH_GOOGLE_CLIENT_ID: optional(z.string()),
  AUTH_GOOGLE_CLIENT_SECRET: optional(z.string()),
  // One-time first-owner setup token (D23 hardening, proposed): the deployer sets it, /admin/setup asks for it.
  SETUP_TOKEN: optional(z.string().min(16, "at least 16 characters")),
  // First Owner from deployment credentials (npm run owner:bootstrap). Server-only; never logged.
  OWNER_EMAIL: optional(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "an email address")),
  OWNER_PASSWORD: optional(z.string().min(10, "at least 10 characters").max(128)),
  OWNER_NAME: optional(z.string().max(80)),

  UPSTASH_REDIS_REST_URL: optional(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string()),

  CLOUDINARY_CLOUD_NAME: optional(z.string()),
  CLOUDINARY_API_KEY: optional(z.string()),
  CLOUDINARY_API_SECRET: optional(z.string()),

  RESEND_API_KEY: optional(z.string()),
  EMAIL_FROM: optional(z.string().min(3)),

  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional(z.string()),
  VAPID_PRIVATE_KEY: optional(z.string()),
  VAPID_SUBJECT: optional(z.string().regex(/^(mailto:.+@.+|https:\/\/.+)$/, "mailto:<address> or https:// URL")),

  GEMINI_API_KEY: optional(z.string()),
  /** Optional model override for AI drafts (B9 part 2b); default in lib/adapters/ai/gemini.ts. */
  GEMINI_MODEL: optional(z.string().regex(/^[a-z0-9][a-z0-9.\-]{2,79}$/, "a Gemini model id such as gemini-3.5-flash-lite")),

  STEADFAST_API_KEY: optional(z.string()),
  STEADFAST_SECRET_KEY: optional(z.string()),
  PATHAO_CLIENT_ID: optional(z.string()),
  PATHAO_CLIENT_SECRET: optional(z.string()),
  PATHAO_USERNAME: optional(z.string()),
  PATHAO_PASSWORD: optional(z.string()),
  COURIER_WEBHOOK_SECRET: optional(z.string().min(16, "at least 16 characters")),

  ABLY_API_KEY: optional(z.string()),

  JOBS_TRIGGER: z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined), z.enum(["worker", "http", "vercel-cron"]).optional()),
  CRON_SECRET: optional(z.string().min(16, "at least 16 characters")),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
type EnvName = keyof ServerEnv;

/** Integrations and the variables each one needs in full. */
export const integrationVariables = {
  database: ["MONGODB_URI"],
  googleSignIn: ["AUTH_GOOGLE_CLIENT_ID", "AUTH_GOOGLE_CLIENT_SECRET"],
  redis: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  cloudinary: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
  email: ["RESEND_API_KEY", "EMAIL_FROM"],
  push: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
  gemini: ["GEMINI_API_KEY"],
  steadfast: ["STEADFAST_API_KEY", "STEADFAST_SECRET_KEY"],
  pathao: ["PATHAO_CLIENT_ID", "PATHAO_CLIENT_SECRET", "PATHAO_USERNAME", "PATHAO_PASSWORD"],
  realtime: ["ABLY_API_KEY"],
} as const satisfies Record<string, readonly EnvName[]>;

export type Integration = keyof typeof integrationVariables;
export type IntegrationState = "configured" | "not_configured" | "incomplete";

export interface EnvIssue {
  name: string;
  problem: string; // never contains the value
}

export interface EnvReport {
  env: Partial<ServerEnv>;
  issues: EnvIssue[];
  integrations: Record<Integration, IntegrationState>;
}

export function parseServerEnv(raw: Record<string, string | undefined>): EnvReport {
  const issues: EnvIssue[] = [];
  const env: Partial<ServerEnv> = {};

  // Validate each variable on its own so one bad value does not hide the others.
  for (const [name, field] of Object.entries(serverEnvSchema.shape)) {
    const result = (field as z.ZodType).safeParse(raw[name]);
    if (result.success) {
      if (result.data !== undefined) (env as Record<string, unknown>)[name] = result.data;
    } else {
      issues.push({ name, problem: result.error.issues[0]?.message ?? "invalid" });
    }
  }

  const integrations = {} as Record<Integration, IntegrationState>;
  for (const [integration, names] of Object.entries(integrationVariables) as [Integration, readonly EnvName[]][]) {
    const present = names.filter((n) => env[n] !== undefined).length;
    const invalid = names.some((n) => issues.some((i) => i.name === n));
    integrations[integration] = present === names.length && !invalid ? "configured" : present === 0 && !invalid ? "not_configured" : "incomplete";
    if (integrations[integration] === "incomplete" && !invalid) {
      issues.push({ name: names.filter((n) => env[n] === undefined).join(", "), problem: `required to complete the ${integration} configuration` });
    }
  }

  return { env, issues, integrations };
}
