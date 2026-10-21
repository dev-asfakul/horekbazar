// Zod helpers for BSON-only types (domain-rules §14). Zod stays the single source of truth for
// every persisted shape; these helpers tag the generated JSON Schema with the MongoDB `bsonType`
// the converter (lib/db/json-schema.ts) keeps.
// Relative `.ts` imports keep this module runnable by the Node 24 CLI scripts (db:validators, db:migrate).
import { ObjectId } from "mongodb";
import { z } from "zod";

export const zObjectId = () =>
  z.custom<ObjectId>((v) => v instanceof ObjectId, { message: "must be an ObjectId" }).meta({ bsonType: "objectId" });

/** A BSON date. JSON Schema cannot express it, so the converter maps Zod's `date` type to `bsonType: "date"`. */
export const zDate = () => z.date();

/** A whole number stored as BSON int or long (counters, and money in poisha from B4). */
export const zInt = () => z.number().int();
