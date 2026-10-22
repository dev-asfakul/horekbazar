// Courier port (B8). What each courier can do on this deployment, read from the environment only.
// Manual fulfilment is always available and needs no account, so a shop never has to pay for a
// courier integration to ship. Nothing here contacts a courier.
import type { CourierKey } from "../../modules/fulfilment/schema.ts";
import { steadfastConfig } from "./steadfast.ts";

export type CourierState = "available" | "not_configured" | "blocked" | "unsupported";

export interface CourierAvailability {
  key: CourierKey;
  state: CourierState;
  /** Booking through the courier's API from the admin. */
  booking: boolean;
  /** Webhook endpoint accepts this courier's callbacks (needs COURIER_WEBHOOK_SECRET). */
  webhook: boolean;
  /** Admin-facing reason when not available (English, no secrets). */
  reason?: string;
}

export function courierAvailability(env: Record<string, string | undefined> = process.env): CourierAvailability[] {
  const webhookSecret = Boolean(env.COURIER_WEBHOOK_SECRET?.trim());
  const steadfast = steadfastConfig(env) !== null;
  const pathaoKeys = ["PATHAO_CLIENT_ID", "PATHAO_CLIENT_SECRET", "PATHAO_USERNAME", "PATHAO_PASSWORD"].every((k) => Boolean(env[k]?.trim()));
  return [
    { key: "manual", state: "available", booking: false, webhook: false },
    steadfast
      ? { key: "steadfast", state: "available", booking: true, webhook: webhookSecret, ...(webhookSecret ? {} : { reason: "Status updates by webhook need COURIER_WEBHOOK_SECRET; use Refresh status meanwhile." }) }
      : { key: "steadfast", state: "not_configured", booking: false, webhook: false, reason: "Set STEADFAST_API_KEY and STEADFAST_SECRET_KEY to book with Steadfast." },
    {
      key: "pathao",
      state: "blocked",
      booking: false,
      webhook: false,
      reason: pathaoKeys
        ? "Pathao booking needs Pathao city, zone and area ids for each address. That mapping depends on the open location-dataset decision (D12), so it is not built yet."
        : "Not configured, and Pathao booking needs the location-dataset decision (D12) first.",
    },
    { key: "redx", state: "unsupported", booking: false, webhook: false, reason: "RedX is not part of this build. Ship manually and enter the tracking details." },
  ];
}

export function courierState(key: CourierKey, env: Record<string, string | undefined> = process.env): CourierAvailability {
  return courierAvailability(env).find((c) => c.key === key)!;
}

export const COURIER_NAMES: Record<CourierKey, string> = { manual: "Manual", steadfast: "Steadfast", pathao: "Pathao", redx: "RedX" };
