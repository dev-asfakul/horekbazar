// B10 part b: the export sanitiser drops credentials, tokens, push keys, internal keys and staff
// identities at any depth, and turns BSON into plain JSON.
import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { exportValue, privacyRequestSchema } from "@/lib/modules/identity/privacy";
import { LIMITS } from "@/lib/modules/identity/limits";

describe("privacy export sanitiser", () => {
  it("drops denied keys at any depth and converts ids and dates", () => {
    const id = new ObjectId();
    const at = new Date("2026-10-23T00:00:00Z");
    expect(
      exportValue({ _id: id, userId: "u", password: "x", nested: [{ token: "t", keys: { auth: "k" }, by: { type: "staff", id: "s" }, body: "ok", at }], version: 3, checkoutKey: "c" }),
    ).toEqual({ id: String(id), nested: [{ body: "ok", at: "2026-10-23T00:00:00.000Z" }] });
  });
  it("the request schema has no free-form fields and the limit counts wrong passwords", () => {
    expect(privacyRequestSchema.safeParse({ _id: new ObjectId(), userId: "u", kind: "deletion", status: "received", createdAt: new Date(), updatedAt: new Date(), note: "x" }).success).toBe(false);
    expect(LIMITS.privacyRequest).toEqual({ name: "privacy-request", limit: 5, windowSeconds: 3600 });
  });
});
