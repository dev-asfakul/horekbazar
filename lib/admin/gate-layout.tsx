// Section layouts run the staff gate before the section's loading boundary (loading.tsx) starts
// streaming, so a signed-out visitor still gets a real redirect and a missing capability a real 403
// instead of a 200 with the skeleton. The page calls the same gate again (cached per request).
import type { ReactNode } from "react";
import { gateStaffPage } from "@/lib/auth/server";
import type { AdminPage } from "@/lib/modules/identity/paths";

export function gatedLayout(page: AdminPage) {
  return async function GatedLayout({ children }: { children: ReactNode }) {
    await gateStaffPage(page);
    return children;
  };
}
