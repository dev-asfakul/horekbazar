// Tier: reuse pattern (shadcn Button variants). Use-when: every action and button-styled link. Avoid-when: navigation inside text (use links).
// Reduced-motion: press scale and spinner removed under reduced motion; a static ellipsis replaces the spinner. Touch: 44 x 44 px minimum.
// Button and button-styled link (DESIGN.md → Components → Buttons). Variants: primary, secondary,
// quiet, danger. Loading keeps the label, shows a spinner beside it and sets aria-busy.
// Styles live in app/globals.css (.btn*). No inline style attributes: the production CSP blocks them.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

function classes(variant: ButtonVariant, extra?: string) {
  return ["btn", `btn-${variant}`, extra].filter(Boolean).join(" ");
}

type ButtonProps = Omit<ComponentProps<"button">, "children"> & {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
};

export function Button({ variant = "primary", loading = false, disabled, className, type = "button", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classes(variant, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      // A loading button stays focusable (so focus is not lost) but does not act twice.
      aria-disabled={loading || undefined}
      data-loading={loading || undefined}
    >
      {loading ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span className="spinner-static" aria-hidden="true">
            …
          </span>
        </>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & { variant?: ButtonVariant; className?: string };

export function ButtonLink({ variant = "primary", className, ...rest }: ButtonLinkProps) {
  return <Link {...rest} className={classes(variant, className)} />;
}
