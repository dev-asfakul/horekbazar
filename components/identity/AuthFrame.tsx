// Tier: build. Use-when: sign-in, registration, password reset, verification and owner setup pages.
// Avoid-when: signed-in account pages (AccountFrame). Reduced-motion: no motion. Touch: content only.
// Redesign (Night Bazaar Light): one centred card on the ground colour — a lime icon badge, the
// title, the intro, the form — and the secondary links (forgot password, create an account) under
// the card. Width capped near 28rem so forms stay one comfortable column at every size.
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

export function AuthFrame({ title, intro, children, aside, icon = "user" }: { title: string; intro?: ReactNode; children: ReactNode; aside?: ReactNode; icon?: IconName }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-badge">
          <Icon name={icon} size={26} />
        </span>
        <h1 className="auth-title font-display">{title}</h1>
        {intro ? <div className="auth-intro">{intro}</div> : null}
        <div className="auth-body">{children}</div>
      </div>
      {aside ? <div className="auth-aside">{aside}</div> : null}
    </div>
  );
}
