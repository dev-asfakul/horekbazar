// Phase E: the shared browser push helpers (used by PushOptIn and OrderUpdatesPrompt).
import { describe, expect, it } from "vitest";
import { keyBytes, subscriptionPayload } from "@/components/notifications/push-client";

describe("push-client", () => {
  it("decodes a base64url VAPID key", () => {
    expect(Array.from(keyBytes("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
  });
  it("builds the save payload; offers are whatever the caller passes (the prompt passes off)", () => {
    const sub = { endpoint: "https://push.example/x", toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }) } as unknown as PushSubscription;
    expect(subscriptionPayload(sub, { orders: true, marketing: false }, "bn")).toEqual({ endpoint: "https://push.example/x", keys: { p256dh: "p", auth: "a" }, topics: { orders: true, marketing: false }, locale: "bn" });
  });
});
