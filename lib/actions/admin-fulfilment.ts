"use server";
// B8 staff actions for shipments, returned parcels and customer returns. Every action resolves the
// staff member and checks the capability on the server first (staffContext): fulfilment.write for
// shipments, returns.process for inspection, restock, write-off and refunds. The services enforce
// the state machines; ids from the form are re-read from the database.
import { refresh } from "next/cache";
import { ObjectId } from "mongodb";
import type { FormState } from "@/lib/actions/form-state";
import { fail, field, ok, parseTaka, serviceErrorCode, staffContext } from "@/lib/actions/staff-action";
import { COURIER_KEYS, RETURN_STATUSES, SHIPMENT_STATUSES, SHIPMENTS, type CourierKey, type ShipmentDoc, type ReturnStatus, type ShipmentStatus } from "@/lib/modules/fulfilment/schema";
import { createShipment, inspectReturnedLine, retryBooking, STAFF_STEPS, transitionShipment, updateTracking, type TrackingInput } from "@/lib/modules/fulfilment/shipments";
import { inspectReturn, recordRefund, settleReturn, SIMPLE_STEPS, transitionReturn } from "@/lib/modules/fulfilment/returns";
import { requestCourierSync } from "@/lib/modules/fulfilment/webhooks";
import { CommerceError } from "@/lib/modules/pricing/cart";

const objectId = (form: FormData, key: string) => {
  const v = field(form, key);
  return ObjectId.isValid(v) && v.length === 24 ? new ObjectId(v) : null;
};
const optional = (form: FormData, key: string) => field(form, key).trim() || undefined;

function serviceFail(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof CommerceError && error.code === "tracking_invalid") {
    const fieldsWrong = (error.detail?.fields as string[] | undefined) ?? [];
    return fail("fix_fields", Object.fromEntries(fieldsWrong.map((f) => [f, "invalid"])), values);
  }
  const code = serviceErrorCode(error);
  if (code === "try_again") console.error("fulfilment action failed", error instanceof Error ? error.name : "unknown");
  return fail(code, undefined, values);
}

function trackingFrom(form: FormData): { input: TrackingInput; values: Record<string, string> } {
  const values = Object.fromEntries(["carrierName", "consignmentId", "trackingCode", "trackingUrl", "note"].map((k) => [k, field(form, k)]));
  return { input: { carrierName: optional(form, "carrierName"), consignmentId: optional(form, "consignmentId"), trackingCode: optional(form, "trackingCode"), trackingUrl: optional(form, "trackingUrl") }, values };
}

export async function createShipmentAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("fulfilment.write");
  if ("error" in ctx) return ctx.error;
  const orderId = objectId(form, "orderId");
  const courier = COURIER_KEYS.find((c) => c === field(form, "courier")) as CourierKey | undefined;
  if (!orderId || !courier) return fail("commerce_not_found");
  const { input, values } = trackingFrom(form);
  if (courier === "manual" && !input.carrierName) return fail("fix_fields", { carrierName: "required" }, values);
  try {
    const s = await createShipment(ctx.db, { ...input, orderId, courier, note: optional(form, "note"), actor: { type: "staff", ...ctx.actor } });
    refresh();
    return ok(s.booking?.state === "failed" ? "shipment_booking_failed" : s.booking?.state === "requested" ? "shipment_booking_pending" : "shipment_created");
  } catch (error) {
    return serviceFail(error, values);
  }
}

export async function updateTrackingAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("fulfilment.write");
  if ("error" in ctx) return ctx.error;
  const shipmentId = objectId(form, "shipmentId");
  if (!shipmentId) return fail("commerce_not_found");
  const { input, values } = trackingFrom(form);
  // Only the fields this form shows are edited (a courier shipment's form has no consignment field).
  const shown = field(form, "fields").split(",");
  const patch: TrackingInput = {};
  for (const k of ["carrierName", "consignmentId", "trackingCode", "trackingUrl"] as const) if (shown.includes(k)) patch[k] = input[k];
  try {
    await updateTracking(ctx.db, { ...patch, shipmentId, expectedVersion: Number(field(form, "version")), actor: { type: "staff", ...ctx.actor } });
  } catch (error) {
    return serviceFail(error, values);
  }
  refresh();
  return ok("shipment_updated");
}

export async function shipmentStepAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("fulfilment.write");
  if ("error" in ctx) return ctx.error;
  const shipmentId = objectId(form, "shipmentId");
  const to = SHIPMENT_STATUSES.find((s) => s === field(form, "to")) as ShipmentStatus | undefined;
  if (!shipmentId || !to || !STAFF_STEPS.includes(to)) return fail("try_again");
  const reason = field(form, "reason").trim().slice(0, 500);
  try {
    await transitionShipment(ctx.db, { shipmentId, expectedVersion: Number(field(form, "version")), to, reason: reason || undefined, actor: { type: "staff", ...ctx.actor } });
  } catch (error) {
    return serviceFail(error, { reason });
  }
  refresh();
  return ok("shipment_updated");
}

export async function retryBookingAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("fulfilment.write");
  if ("error" in ctx) return ctx.error;
  const shipmentId = objectId(form, "shipmentId");
  if (!shipmentId) return fail("commerce_not_found");
  try {
    await retryBooking(ctx.db, { shipmentId, expectedVersion: Number(field(form, "version")), actor: { type: "staff", ...ctx.actor } });
  } catch (error) {
    return serviceFail(error);
  }
  refresh();
  return ok("shipment_booking_pending");
}

export async function refreshCourierStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("fulfilment.write");
  if ("error" in ctx) return ctx.error;
  const shipmentId = objectId(form, "shipmentId");
  if (!shipmentId) return fail("commerce_not_found");
  const outcome = await requestCourierSync(ctx.db, shipmentId);
  const after = await ctx.db.collection<ShipmentDoc>(SHIPMENTS).findOne({ _id: shipmentId }, { projection: { lastSync: 1 } });
  refresh();
  return outcome === "done" && after?.lastSync?.ok === true ? ok("courier_synced") : fail("commerce_courier_sync_failed");
}

export async function inspectRtoLineAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("returns.process");
  if ("error" in ctx) return ctx.error;
  const shipmentId = objectId(form, "shipmentId");
  const outcome = field(form, "outcome");
  const lineId = field(form, "lineId");
  if (!shipmentId || !/^[a-f0-9]{24}$/.test(lineId)) return fail("commerce_not_found");
  if (outcome !== "restock" && outcome !== "write_off") return fail("fix_fields", { outcome: "required" });
  try {
    await inspectReturnedLine(ctx.db, { shipmentId, lineId, outcome, note: optional(form, "note"), actor: { type: "staff", ...ctx.actor } });
  } catch (error) {
    return serviceFail(error, { note: field(form, "note") });
  }
  refresh();
  return ok("return_updated");
}

export async function returnStepAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("returns.process");
  if ("error" in ctx) return ctx.error;
  const returnId = objectId(form, "returnId");
  const to = RETURN_STATUSES.find((s) => s === field(form, "to")) as ReturnStatus | undefined;
  if (!returnId || !to || !SIMPLE_STEPS.includes(to)) return fail("try_again");
  const note = field(form, "note").trim().slice(0, 500);
  try {
    await transitionReturn(ctx.db, { returnId, expectedVersion: Number(field(form, "version")), to, note: note || undefined, actor: { type: "staff", ...ctx.actor } });
  } catch (error) {
    return serviceFail(error, { note });
  }
  refresh();
  return ok("return_updated");
}

export async function inspectReturnAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("returns.process");
  if ("error" in ctx) return ctx.error;
  const returnId = objectId(form, "returnId");
  if (!returnId) return fail("commerce_not_found");
  const lineIds = field(form, "lineIds").split(",").filter((l) => /^[a-f0-9]{24}$/.test(l));
  const outcomes: Record<string, { outcome: "restock" | "write_off"; note?: string | undefined }> = {};
  const errors: Record<string, string> = {};
  const values: Record<string, string> = { note: field(form, "note") };
  for (const id of lineIds) {
    const o = field(form, `outcome_${id}`);
    values[`outcome_${id}`] = o;
    values[`note_${id}`] = field(form, `note_${id}`);
    if (o !== "restock" && o !== "write_off") errors[`outcome_${id}`] = "required";
    else outcomes[id] = { outcome: o, note: optional(form, `note_${id}`) };
  }
  if (lineIds.length === 0 || Object.keys(errors).length) return fail("fix_fields", errors, values);
  try {
    await inspectReturn(ctx.db, { returnId, expectedVersion: Number(field(form, "version")), outcomes, note: optional(form, "note"), actor: { type: "staff", ...ctx.actor } });
  } catch (error) {
    return serviceFail(error, values);
  }
  refresh();
  return ok("return_updated");
}

export async function settleReturnAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("returns.process");
  if ("error" in ctx) return ctx.error;
  const returnId = objectId(form, "returnId");
  if (!returnId) return fail("commerce_not_found");
  try {
    await settleReturn(ctx.db, { returnId, expectedVersion: Number(field(form, "version")), actor: { type: "staff", ...ctx.actor } });
  } catch (error) {
    return serviceFail(error);
  }
  refresh();
  return ok("return_updated");
}

export async function recordRefundAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("returns.process");
  if ("error" in ctx) return ctx.error;
  const returnId = objectId(form, "returnId");
  if (!returnId) return fail("commerce_not_found");
  const values = { method: field(form, "method"), amount: field(form, "amount"), reference: field(form, "reference") };
  const method = (["bkash", "nagad", "bank"] as const).find((m) => m === values.method);
  const amount = parseTaka(values.amount);
  const errors: Record<string, string> = {};
  if (!method) errors.method = "required";
  if (amount === null || amount <= 0) errors.amount = "number_invalid";
  if (Object.keys(errors).length) return fail("fix_fields", errors, values);
  try {
    await recordRefund(ctx.db, { returnId, expectedVersion: Number(field(form, "version")), method: method!, amount: amount!, reference: optional(form, "reference"), actor: { type: "staff", ...ctx.actor } });
  } catch (error) {
    return serviceFail(error, values);
  }
  refresh();
  return ok("return_updated");
}
