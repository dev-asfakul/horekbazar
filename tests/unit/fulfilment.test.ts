// B8 pure rules: courier status order, Steadfast request shaping and error classes, tracking input,
// courier availability per environment, and the capabilities behind the new admin pages.
import { describe, expect, it } from "vitest";
import { courierAvailability } from "@/lib/adapters/courier/index";
import { CourierRequestError, steadfastBookingProblems, steadfastConfig, steadfastCreateOrder, steadfastStatusByConsignment } from "@/lib/adapters/courier/steadfast";
import { courierStatusAdvances, COURIER_STATUS_RANK, normaliseCourierStatus } from "@/lib/modules/fulfilment/courier-status";
import { localBdPhone, steadfastBookingInput } from "@/lib/modules/fulfilment/courier-jobs";
import { SHIPMENT_TRANSITIONS, trackingProblems } from "@/lib/modules/fulfilment/shipments";
import { RETURN_TRANSITIONS } from "@/lib/modules/fulfilment/returns";
import { outsideWindow, parseSteadfastEvent } from "@/lib/modules/fulfilment/webhooks";
import { BUILT_IN_ROLES } from "@/lib/modules/identity/capabilities";
import { ADMIN_PAGE_CAPABILITY } from "@/lib/modules/identity/paths";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const config = { apiKey: "key-never-logged", secretKey: "secret-never-logged" };

describe("courier status order", () => {
  it("normalises raw values and treats anything unknown as unknown", () => {
    expect(normaliseCourierStatus("Delivered")).toBe("delivered");
    expect(normaliseCourierStatus("partial delivered")).toBe("partial_delivered");
    expect(normaliseCourierStatus("teleported")).toBe("unknown");
  });

  it("moves forward only; final statuses never change; sideways moves only below final", () => {
    const at = (code: keyof typeof COURIER_STATUS_RANK) => ({ code, rank: COURIER_STATUS_RANK[code] });
    expect(courierStatusAdvances(undefined, "pending")).toBe(true);
    expect(courierStatusAdvances(at("pending"), "hold")).toBe(true);
    expect(courierStatusAdvances(at("hold"), "pending")).toBe(false);
    expect(courierStatusAdvances(at("hold"), "unknown")).toBe(true);
    expect(courierStatusAdvances(at("hold"), "hold")).toBe(false);
    expect(courierStatusAdvances(at("delivered_approval_pending"), "delivered")).toBe(true);
    expect(courierStatusAdvances(at("delivered"), "cancelled")).toBe(false);
    expect(courierStatusAdvances(at("cancelled"), "delivered")).toBe(false);
  });
});

describe("state machines", () => {
  it("shipments: no skipping hand-over, terminal states are terminal", () => {
    expect(SHIPMENT_TRANSITIONS.draft).not.toContain("handed_over");
    expect(SHIPMENT_TRANSITIONS.booked).not.toContain("delivered");
    expect(SHIPMENT_TRANSITIONS.handed_over).not.toContain("cancelled");
    for (const s of ["delivered", "returned", "cancelled"] as const) expect(SHIPMENT_TRANSITIONS[s]).toEqual([]);
  });

  it("returns: stock moves only from inspected", () => {
    const into = Object.entries(RETURN_TRANSITIONS).filter(([, to]) => to.includes("restocked") || to.includes("written_off")).map(([from]) => from);
    expect(into).toEqual(["inspected"]);
  });
});

describe("Steadfast adapter", () => {
  it("is configured only with both keys", () => {
    expect(steadfastConfig({})).toBeNull();
    expect(steadfastConfig({ STEADFAST_API_KEY: "a" })).toBeNull();
    expect(steadfastConfig({ STEADFAST_API_KEY: "a", STEADFAST_SECRET_KEY: " " })).toBeNull();
    expect(steadfastConfig({ STEADFAST_API_KEY: "a", STEADFAST_SECRET_KEY: "b" })).toEqual({ apiKey: "a", secretKey: "b" });
  });

  it("shapes the booking from the order snapshot and checks the documented limits", () => {
    expect(localBdPhone("+8801712345678")).toBe("01712345678");
    const input = steadfastBookingInput({ address: { label: "home", name: "রহিম", phone: "+8801712345678", zoneId: "dhaka", zoneName: { bn: "ঢাকা" }, district: "ঢাকা", area: "মিরপুর", line: "বাসা ১২", landmark: "মসজিদের পাশে" }, totals: { merchandise: 100000, savings: 0, coupon: 0, rewards: 0, delivery: 6000, grandTotal: 106050 } } as never, "ORD-1-1");
    expect(input).toEqual({ invoice: "ORD-1-1", recipientName: "রহিম", recipientPhone: "01712345678", recipientAddress: "বাসা ১২, মিরপুর, ঢাকা, মসজিদের পাশে", codAmount: 1060.5 });
    expect(steadfastBookingProblems(input)).toEqual([]);
    expect(steadfastBookingProblems({ ...input, recipientAddress: "x".repeat(251), recipientPhone: "+8801712345678", invoice: "bad invoice" })).toEqual(["invoice", "recipient_phone", "recipient_address"]);
  });

  it("returns the consignment only from an accepted answer and classifies failures", async () => {
    const ok = await steadfastCreateOrder(config, { invoice: "A-1", recipientName: "R", recipientPhone: "01712345678", recipientAddress: "Dhaka", codAmount: 10 }, json(200, { status: 200, consignment: { consignment_id: 1424107, tracking_code: "15BAEB8A", status: "in_review" } }) as never);
    expect(ok).toEqual({ consignmentId: "1424107", trackingCode: "15BAEB8A", status: "in_review" });
    const refuse = await steadfastCreateOrder(config, { invoice: "A-1", recipientName: "R", recipientPhone: "01712345678", recipientAddress: "Dhaka", codAmount: 10 }, json(422, { status: 422, message: "invalid", errors: { invoice: ["taken"] } }) as never).catch((e: unknown) => e);
    expect(refuse).toBeInstanceOf(CourierRequestError);
    expect((refuse as CourierRequestError).retryable).toBe(false);
    expect(String((refuse as Error).message)).not.toMatch(/never-logged/);
    // HTTP 200 with no consignment is not a booking.
    const empty = await steadfastCreateOrder(config, { invoice: "A-1", recipientName: "R", recipientPhone: "01712345678", recipientAddress: "Dhaka", codAmount: 10 }, json(200, { status: 200 }) as never).catch((e: unknown) => e);
    expect(empty).toBeInstanceOf(CourierRequestError);
    const outage = await steadfastStatusByConsignment(config, "1424107", json(502, {}) as never).catch((e: unknown) => e);
    expect((outage as CourierRequestError).retryable).toBe(true);
    expect(await steadfastStatusByConsignment(config, "1424107", json(200, { status: 200, delivery_status: "hold" }) as never)).toBe("hold");
  });
});

describe("webhook parsing", () => {
  it("keys an event by its identifying fields and reads Steadfast local times as Dhaka time", () => {
    const a = parseSteadfastEvent({ consignment_id: 1, status: "hold", updated_at: "2026-10-22 12:00:00", extra: "ignored" })!;
    const b = parseSteadfastEvent({ consignment_id: "1", status: "hold", updated_at: "2026-10-22 12:00:00" })!;
    expect(a.eventId).toBe(b.eventId);
    expect(a.occurredAt?.toISOString()).toBe("2026-10-22T06:00:00.000Z");
    expect(parseSteadfastEvent({ consignment_id: 1, status: "delivered", updated_at: "2026-10-22 12:00:00" })!.eventId).not.toBe(a.eventId);
    const now = new Date("2026-10-22T06:00:00Z");
    expect(outsideWindow(new Date("2026-10-18T00:00:00Z"), now)).toBe(true);
    expect(outsideWindow(new Date("2026-10-22T07:00:00Z"), now)).toBe(true);
    expect(outsideWindow(new Date("2026-10-21T06:00:00Z"), now)).toBe(false);
    expect(outsideWindow(undefined, now)).toBe(false);
  });
});

describe("tracking input", () => {
  it("accepts https links and courier-style numbers only", () => {
    expect(trackingProblems({ consignmentId: "SF-123/45", trackingUrl: "https://steadfast.example.com/t/123" })).toEqual([]);
    expect(trackingProblems({ trackingUrl: "http://example.com" })).toEqual(["trackingUrl"]);
    expect(trackingProblems({ trackingUrl: "javascript:alert(1)" })).toEqual(["trackingUrl"]);
    expect(trackingProblems({ trackingUrl: "https://user:pw@example.com" })).toEqual(["trackingUrl"]);
    expect(trackingProblems({ consignmentId: "12 34" })).toEqual(["consignmentId"]);
    expect(trackingProblems({ carrierName: " " })).toEqual(["carrierName"]);
  });
});

describe("courier availability", () => {
  it("manual is always available; others say why they are not", () => {
    const none = courierAvailability({});
    expect(none.find((c) => c.key === "manual")).toMatchObject({ state: "available" });
    expect(none.find((c) => c.key === "steadfast")).toMatchObject({ state: "not_configured", booking: false });
    expect(none.find((c) => c.key === "pathao")).toMatchObject({ state: "blocked", booking: false });
    expect(none.find((c) => c.key === "redx")).toMatchObject({ state: "unsupported" });
    const sf = courierAvailability({ STEADFAST_API_KEY: "a", STEADFAST_SECRET_KEY: "b" }).find((c) => c.key === "steadfast")!;
    expect(sf).toMatchObject({ state: "available", booking: true, webhook: false });
    expect(courierAvailability({ STEADFAST_API_KEY: "a", STEADFAST_SECRET_KEY: "b", COURIER_WEBHOOK_SECRET: "x".repeat(32) }).find((c) => c.key === "steadfast")!.webhook).toBe(true);
    for (const c of none) expect(JSON.stringify(c)).not.toMatch(/=/);
  });
});

describe("capabilities", () => {
  it("guards the new admin pages and keeps them away from support agents", () => {
    expect(ADMIN_PAGE_CAPABILITY["/admin/shipments"]).toBe("fulfilment.write");
    expect(ADMIN_PAGE_CAPABILITY["/admin/returns"]).toBe("returns.process");
    expect(ADMIN_SECTIONS.find((s) => s.key === "shipments")?.capability).toBe("fulfilment.write");
    const support = BUILT_IN_ROLES.find((r) => r.key === "support_agent")!;
    expect(support.capabilities).not.toContain("fulfilment.write");
    expect(support.capabilities).not.toContain("returns.process");
    const operator = BUILT_IN_ROLES.find((r) => r.key === "order_operator")!;
    expect(operator.capabilities).toEqual(expect.arrayContaining(["fulfilment.write", "returns.process"]));
  });
});
