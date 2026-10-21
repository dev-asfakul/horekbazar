// Tier: build. Use-when: admin record lists (B4 catalogue, merchandising). Avoid-when: storefront.
// Reduced-motion: static. Touch: links and buttons are 44 px targets.
// Status chips carry a text label as well as colour (DESIGN.md → Admin: "status chips that carry a
// text label as well as colour"); the Sample badge marks generated records (owner change to D11).
import Link from "next/link";

export type ChipTone = "draft" | "published" | "archived" | "active" | "warning";

export function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  return (
    <span className="status-chip" data-tone={tone}>
      {label}
    </span>
  );
}

export function SampleBadge({ label, title }: { label: string; title: string }) {
  return (
    <span className="sample-badge" title={title} data-testid="sample-badge">
      {label}
    </span>
  );
}

/** Previous / next links that keep the current filters; renders nothing for a single page. */
export function Pager({ page, pages, hrefFor, labels }: { page: number; pages: number; hrefFor: (page: number) => string; labels: { prev: string; next: string; status: string; nav: string } }) {
  if (pages <= 1) return null;
  return (
    <nav className="admin-pager" aria-label={labels.nav}>
      {page > 1 ? (
        <Link className="btn btn-secondary" href={hrefFor(page - 1)} rel="prev">
          {labels.prev}
        </Link>
      ) : null}
      <span className="admin-pager-status">{labels.status}</span>
      {page < pages ? (
        <Link className="btn btn-secondary" href={hrefFor(page + 1)} rel="next">
          {labels.next}
        </Link>
      ) : null}
    </nav>
  );
}

/**
 * An admin thumbnail from a Cloudinary delivery URL that is already resized and format-optimised by
 * its transformation (c_fill, f_auto, q_auto), so next/image would only add a second optimiser.
 */
export function AdminImage({ src, alt, size, className, lazy = true }: { src: string; alt: string; size: number; className?: string; lazy?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves the sized image.
  return <img className={className} src={src} alt={alt} width={size} height={size} loading={lazy ? "lazy" : "eager"} decoding="async" />;
}
