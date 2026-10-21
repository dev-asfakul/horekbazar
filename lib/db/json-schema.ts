// Zod 4 → MongoDB `$jsonSchema` converter (domain-rules §14).
// `z.toJSONSchema()` produces draft 2020-12 JSON Schema; MongoDB implements a draft-4 subset with
// `bsonType`. This maps types to `bsonType`, rewrites draft-2020 numeric exclusives to draft-4 form,
// drops keywords MongoDB rejects or ignores, and fails loudly on anything it does not understand,
// so a schema the database cannot enforce is never committed silently.
import { z } from "zod";

type Json = Record<string, unknown>;

const TYPE_TO_BSON: Record<string, string[]> = {
  string: ["string"],
  integer: ["int", "long"],
  number: ["int", "long", "double"],
  boolean: ["bool"],
  object: ["object"],
  array: ["array"],
  null: ["null"],
};

/** Keywords MongoDB's `$jsonSchema` accepts (MongoDB manual, "$jsonSchema" → available keywords). */
const MONGO_KEYWORDS = new Set([
  "bsonType", "enum", "allOf", "anyOf", "oneOf", "not", "multipleOf", "maximum", "exclusiveMaximum",
  "minimum", "exclusiveMinimum", "maxLength", "minLength", "pattern", "maxProperties", "minProperties",
  "required", "additionalProperties", "properties", "patternProperties", "dependencies", "additionalItems",
  "items", "maxItems", "minItems", "uniqueItems", "title", "description",
]);

/** Draft-2020 keywords that carry no constraint MongoDB can apply; removed. */
const DROPPED = new Set(["$schema", "$id", "format", "default", "examples", "propertyNames", "contentEncoding", "contentMediaType"]);

export class UnsupportedSchemaError extends Error {}

function toMongo(node: unknown, path: string): unknown {
  if (Array.isArray(node)) return node.map((n, i) => toMongo(n, `${path}[${i}]`));
  if (node === null || typeof node !== "object") return node;
  const src = node as Json;
  const out: Json = {};

  for (const [key, value] of Object.entries(src)) {
    if (DROPPED.has(key)) continue;
    switch (key) {
      case "$ref":
      case "$defs":
      case "definitions":
        throw new UnsupportedSchemaError(`${path}: ${key} is not supported by MongoDB; inline the schema`);
      case "type": {
        const types = Array.isArray(value) ? value : [value];
        const bson = types.flatMap((t) => {
          const mapped = TYPE_TO_BSON[String(t)];
          if (!mapped) throw new UnsupportedSchemaError(`${path}: unknown JSON type ${String(t)}`);
          return mapped;
        });
        if (src.bsonType === undefined) out.bsonType = [...new Set(bson)].length === 1 ? bson[0] : [...new Set(bson)];
        break;
      }
      case "const":
        out.enum = [value];
        break;
      case "exclusiveMinimum":
      case "exclusiveMaximum": {
        // Draft 2020: a number. Draft 4 (MongoDB): a boolean next to minimum/maximum.
        if (typeof value === "number") {
          out[key === "exclusiveMinimum" ? "minimum" : "maximum"] = value;
          out[key] = true;
        } else out[key] = value;
        break;
      }
      case "minimum":
      case "maximum":
        // Zod adds the safe-integer range to every .int(); it is noise for the database.
        if (value === Number.MIN_SAFE_INTEGER || value === Number.MAX_SAFE_INTEGER) break;
        if (!(key in out)) out[key] = value;
        break;
      case "properties":
      case "patternProperties":
        for (const [k, v] of Object.entries(value as Json)) {
          if (v && typeof v === "object" && Object.keys(v as Json).length === 0) {
            throw new UnsupportedSchemaError(`${path}.${k}: unconstrained field (a type JSON Schema cannot express); use a bson-zod helper`);
          }
        }
        out[key] = Object.fromEntries(Object.entries(value as Json).map(([k, v]) => [k, toMongo(v, `${path}.${k}`)]));
        break;
      case "items":
      case "additionalProperties":
      case "additionalItems":
      case "not":
        out[key] = typeof value === "boolean" ? value : toMongo(value, `${path}.${key}`);
        break;
      case "anyOf":
      case "oneOf":
      case "allOf":
        out[key] = (value as unknown[]).map((v, i) => toMongo(v, `${path}.${key}[${i}]`));
        break;
      default:
        if (!MONGO_KEYWORDS.has(key)) throw new UnsupportedSchemaError(`${path}: keyword ${key} is not supported by MongoDB`);
        out[key] = value;
    }
  }
  return out;
}

/** Converts a Zod schema for one collection's documents into a MongoDB `$jsonSchema` object. */
export function toMongoJsonSchema(schema: z.ZodType): Json {
  const json = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "output",
    // Dates and ObjectIds are not JSON types; they become `{}` and are tagged with a bsonType below
    // (dates here, ObjectIds through zObjectId's metadata). Any other untagged `{}` is rejected.
    unrepresentable: "any",
    override: (ctx) => {
      const def = (ctx.zodSchema as { _zod: { def: { type: string } } })._zod.def;
      if (def.type === "date") ctx.jsonSchema.bsonType = "date";
    },
  });
  return toMongo(json, "$") as Json;
}
