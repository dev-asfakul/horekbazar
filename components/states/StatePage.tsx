// Tier: build. Use-when: full-page states: 404, 500, offline, setup required. Avoid-when: inline empty states inside a page (EmptyState, later phases).
// Reduced-motion: no motion. Touch: actions use Button (44 px).
// Shared layout for full-page states (404, 500, maintenance, offline, setup required).
import type { ReactNode } from "react";

export function StatePage({ state, title, children }: { state: string; title: string; children?: ReactNode }) {
  return (
    <section className="state-page" data-state={state} aria-labelledby="state-title">
      <h1 id="state-title" className="font-display state-title">
        {title}
      </h1>
      {children}
    </section>
  );
}
