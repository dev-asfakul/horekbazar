import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zDate, zInt, zObjectId } from "@/lib/db/bson-zod";
import { toMongoJsonSchema, UnsupportedSchemaError } from "@/lib/db/json-schema";
import { generateValidatorFiles } from "@/lib/db/validators";

describe("Zod → MongoDB $jsonSchema converter", () => {
  it("maps JSON types to bsonType and BSON helpers to objectId/date/int", () => {
    const schema = z.object({ _id: zObjectId(), at: zDate(), n: zInt().min(0), s: z.string().max(5), b: z.boolean(), x: z.number(), o: z.string().optional() }).strict();
    const out = toMongoJsonSchema(schema) as { properties: Record<string, Record<string, unknown>>; required: string[]; additionalProperties: boolean; bsonType: string };
    expect(out.bsonType).toBe("object");
    expect(out.additionalProperties).toBe(false);
    expect(out.properties._id).toEqual({ bsonType: "objectId" });
    expect(out.properties.at).toEqual({ bsonType: "date" });
    expect(out.properties.n).toEqual({ bsonType: ["int", "long"], minimum: 0 });
    expect(out.properties.s).toEqual({ bsonType: "string", maxLength: 5 });
    expect(out.properties.b).toEqual({ bsonType: "bool" });
    expect(out.properties.x).toEqual({ bsonType: ["int", "long", "double"] });
    expect(out.required).not.toContain("o");
    expect(JSON.stringify(out)).not.toContain("$schema");
  });

  it("rewrites draft-2020 exclusive bounds to MongoDB's draft-4 form and const to enum", () => {
    const out = toMongoJsonSchema(z.object({ p: z.number().positive(), k: z.literal("x") })) as { properties: Record<string, unknown> };
    expect(out.properties.p).toEqual({ bsonType: ["int", "long", "double"], minimum: 0, exclusiveMinimum: true });
    expect(out.properties.k).toEqual({ bsonType: "string", enum: ["x"] });
  });

  it("maps nullable fields to a bsonType list including null", () => {
    const out = toMongoJsonSchema(z.object({ v: z.string().nullable() })) as { properties: { v: unknown } };
    expect(JSON.stringify(out.properties.v)).toContain("null");
  });

  it("refuses fields the database cannot constrain", () => {
    expect(() => toMongoJsonSchema(z.object({ any: z.custom<string>(() => true) }))).toThrow(UnsupportedSchemaError);
  });

  it("refuses $ref (schemas must be inlined)", () => {
    const shared = z.object({ a: z.string() }).meta({ id: "Shared" });
    expect(() => toMongoJsonSchema(z.object({ x: shared, y: shared }))).toThrow(UnsupportedSchemaError);
  });

  it("the committed db/validators files match a fresh generation (CI check 1)", () => {
    for (const [name, content] of generateValidatorFiles()) {
      expect(readFileSync(`db/validators/${name}`, "utf8"), name).toBe(content);
    }
  });
});
