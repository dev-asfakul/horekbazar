// Tier: build. Use-when: sign-in, registration, password reset, verification and owner setup pages.
// Avoid-when: signed-in account pages (AccountFrame). Reduced-motion: no motion. Touch: content only.
// A single narrow column on the ground colour, house-style title, no card box (DESIGN.md → Khata:
// ruled, not boxed). Width capped near 34rem so forms stay one comfortable column at every size.
import type { ReactNode } from "react";

export function AuthFrame({ title, intro, children, aside }: { title: string; intro?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="auth-page">
      <h1 className="auth-title font-display">{title}</h1>
      {intro ? <div className="auth-intro">{intro}</div> : null}
      <div className="auth-body">{children}</div>
      {aside ? <div className="auth-aside">{aside}</div> : null}
    </div>
  );
}
