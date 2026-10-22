import { NET_UNITS } from "@/lib/modules/catalogue/schema";

type UnitT = (key: `units.${(typeof NET_UNITS)[number]}`) => string;

/** Net-quantity unit labels from the "store" namespace (kg, g, ml, L, pc). */
export function unitLabels(t: UnitT): Record<string, string> {
  return Object.fromEntries(NET_UNITS.map((u) => [u, t(`units.${u}`)]));
}
