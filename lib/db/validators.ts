// Generated MongoDB validators (domain-rules §14). The committed files in db/validators/ are the
// output of `npm run db:validators`; CI regenerates them and fails on any difference.
import { collections, type CollectionSpec } from "./collections.ts";
import { toMongoJsonSchema } from "./json-schema.ts";

export const VALIDATORS_DIR = "db/validators";

export function validatorFor(spec: CollectionSpec): { $jsonSchema: Record<string, unknown> } {
  return { $jsonSchema: toMongoJsonSchema(spec.schema) };
}

/** File name → exact file content (stable formatting, trailing newline). */
export function generateValidatorFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const spec of collections) files.set(`${spec.name}.json`, `${JSON.stringify(validatorFor(spec), null, 2)}\n`);
  return files;
}
