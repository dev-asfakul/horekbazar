"use client";
// Tier: build. Use-when: the offline state. Avoid-when: anything that can retry in place (use the page's own retry).
// Reduced-motion: inherits Button: no press scale under reduced motion. Touch: 44 px minimum (Button).
import { Button } from "@/components/ui/Button";

export function ReloadButton({ label }: { label: string }) {
  return (
    <Button variant="primary" onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
