// Tier: build. Use-when: full-page states: 404, 500, offline, setup required. Avoid-when: inline empty states inside a page (EmptyState, later phases).
// Reduced-motion: no motion. Touch: actions use Button (44 px).
// Shared layout for full-page states (404, 500, maintenance, offline, setup required).
// Redesign: centred, with a lime icon badge chosen by the state (decorative; the title says it).
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

const STATE_ICON: Record<string, IconName> = { "not-found": "compass", offline: "wifiOff", error: "alert" };

export function StatePage({ state, title, children }: { state: string; title: string; children?: ReactNode }) {
  return (
    <section className="state-page" data-state={state} aria-labelledby="state-title">
      <span className="state-badge">
        <Icon name={STATE_ICON[state] ?? "info"} size={30} />
      </span>
      <h1 id="state-title" className="font-display state-title">
        {title}
      </h1>
      {children}
    </section>
  );
}
