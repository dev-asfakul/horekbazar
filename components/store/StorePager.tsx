// Pagination for storefront listings: real links (?page=n), rel prev/next, works without JavaScript.
import Link from "next/link";

export function StorePager({ page, pages, hrefFor, labels }: { page: number; pages: number; hrefFor: (page: number) => string; labels: { prev: string; next: string; status: string; nav: string } }) {
  if (pages <= 1) return null;
  return (
    <nav className="store-pager" aria-label={labels.nav}>
      {page > 1 ? (
        <Link className="btn btn-secondary" href={hrefFor(page - 1)} rel="prev">
          {labels.prev}
        </Link>
      ) : null}
      <span className="store-pager-status" aria-current="page">
        {labels.status}
      </span>
      {page < pages ? (
        <Link className="btn btn-secondary" href={hrefFor(page + 1)} rel="next">
          {labels.next}
        </Link>
      ) : null}
    </nav>
  );
}
