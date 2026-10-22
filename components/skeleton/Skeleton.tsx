// Static loading skeletons (DESIGN.md: adapt `loader-skeleton` without the moving shimmer). Each one
// reuses the real layout classes (khata-grid, listing, pdp, record-table) so the content replaces it
// without a layout shift. The wrapper is aria-busy with a visually hidden label; the shapes are
// aria-hidden. Server components: no JavaScript is shipped for them.
import type { ReactNode } from "react";

function Busy({ label, children, className, testId }: { label: string; children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={className} aria-busy="true" data-testid={testId ?? "skeleton"}>
      <span className="sr-only" role="status">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** Widths and heights are fixed classes (the strict CSP forbids style attributes). */
const W = { full: "100%", "90": "90%", "88": "88%", "80": "80%", "70": "70%", "65": "65%", "60": "60%", "55": "55%", "40": "40%", "5r": "5rem", "6r": "6rem", "7r": "7rem", "8r": "8rem", "9r": "9rem", "12r": "12rem", "14r": "14rem", "16r": "16rem", "title": "min(22rem, 70%)", "intro": "min(30rem, 90%)" } as const;
const H = { "0.8": 0.8, "0.85": 0.85, "0.95": 0.95, "1": 1, "1.15": 1.15, "1.25": 1.25, "1.5": 1.5, "1.75": 1.75, "2": 2, "2.5": 2.5, "2.75": 2.75, "3.5": 3.5, "4.5": 4.5 } as const;
export type BoneWidth = keyof typeof W;
export type BoneHeight = keyof typeof H;
export const BONE_WIDTHS = W;
export const BONE_HEIGHTS = H;
const cls = (v: string) => v.replace(".", "_");

/** One grey block. `shape`: "box" (8px corners) or "pill". */
export function Bone({ w = "full", h = "1", shape, className }: { w?: BoneWidth; h?: BoneHeight; shape?: "box" | "pill"; className?: string }) {
  return <span className={["sk-bone", `sk-w-${cls(w)}`, `sk-h-${cls(h)}`, shape ? `sk-${shape}` : "", className ?? ""].filter(Boolean).join(" ")} />;
}

/** The KhataGrid with `count` entries: square media, two-line name, price, meta line. */
export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <ul className="khata-grid">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="khata-item">
          <span className="khata-media sk-media" />
          <Bone w="88" h="0.95" />
          <Bone w="60" h="0.95" />
          <Bone w="40" h="1.15" />
        </li>
      ))}
    </ul>
  );
}

function ListingHead({ intro = true }: { intro?: boolean }) {
  return (
    <header className="listing-head">
      <Bone w="12r" h="0.8" className="sk-crumbs" />
      <Bone w="title" h="2" />
      {intro ? <Bone w="intro" h="1" /> : null}
    </header>
  );
}

/** Category, search, collection, deals and new-arrivals pages: heading, filter column, grid. */
export function ListingSkeleton({ label, filters = true }: { label: string; filters?: boolean }) {
  return (
    <Busy label={label} className="listing" testId="listing-skeleton">
      <ListingHead />
      <div className="listing-body">
        {filters ? (
          <div className="listing-filters sk-filters">
            <Bone w="5r" h="0.85" />
            <Bone h="2.75" shape="box" />
            <Bone h="2.75" shape="box" />
            <Bone w="9r" h="2.75" shape="box" />
          </div>
        ) : null}
        <section className="listing-results">
          <Bone w="7r" h="1" className="sk-count" />
          <SkeletonGrid count={12} />
        </section>
      </div>
    </Busy>
  );
}

/** Home: heading, category tiles, a product row. */
export function HomeSkeleton({ label }: { label: string }) {
  return (
    <Busy label={label} className="listing" testId="home-skeleton">
      <ListingHead />
      <ul className="sk-tiles">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}><Bone h="4.5" shape="box" /></li>
        ))}
      </ul>
      <Bone w="12r" h="1.5" className="sk-section-title" />
      <SkeletonGrid count={8} />
    </Busy>
  );
}

/** /categories and /collections: heading and a list of tiles. */
export function TilesSkeleton({ label }: { label: string }) {
  return (
    <Busy label={label} className="listing" testId="tiles-skeleton">
      <ListingHead />
      <ul className="sk-tiles">
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i}><Bone h="4.5" shape="box" /></li>
        ))}
      </ul>
    </Busy>
  );
}

/** Product page: media column, title, price, options, facts, delivery. */
export function ProductSkeleton({ label }: { label: string }) {
  return (
    <Busy label={label} className="pdp" testId="product-skeleton">
      <Bone w="16r" h="0.8" className="sk-crumbs" />
      <div className="pdp-grid">
        <div className="pdp-media">
          <span className="khata-media sk-media" />
        </div>
        <div className="pdp-info sk-stack">
          <Bone w="80" h="2" />
          <Bone w="55" h="1" />
          <Bone w="6r" h="1.75" />
          <div className="sk-row">
            <Bone w="5r" h="2.5" shape="pill" />
            <Bone w="5r" h="2.5" shape="pill" />
            <Bone w="5r" h="2.5" shape="pill" />
          </div>
          <Bone w="8r" h="1" />
          <Bone h="3.5" shape="box" />
          <Bone w="70" h="1" />
          <Bone w="60" h="1" />
          <Bone w="65" h="1" />
        </div>
      </div>
    </Busy>
  );
}

/** Account pages: heading, side navigation, a form or list. */
export function AccountSkeleton({ label }: { label: string }) {
  return (
    <Busy label={label} className="sk-account" testId="account-skeleton">
      <Bone w="12r" h="2" />
      <div className="sk-stack">
        <Bone w="6r" h="0.85" />
        <Bone h="2.75" shape="box" />
        <Bone w="6r" h="0.85" />
        <Bone h="2.75" shape="box" />
        <Bone w="9r" h="2.75" shape="box" />
      </div>
    </Busy>
  );
}

/** Admin list pages: page head, filter row, table rows. */
export function AdminTableSkeleton({ label, rows = 10, cols = 5 }: { label: string; rows?: number; cols?: number }) {
  return (
    <Busy label={label} className="admin-page" testId="admin-skeleton">
      <div className="admin-page-head">
        <div className="sk-stack">
          <Bone w="12r" h="1.75" />
          <Bone w="6r" h="0.85" />
        </div>
      </div>
      <div className="sk-row sk-admin-filters">
        <Bone w="16r" h="2.5" shape="box" />
        <Bone w="9r" h="2.5" shape="box" />
        <Bone w="6r" h="2.5" shape="box" />
      </div>
      <div className="sk-table">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="sk-table-row">
            {Array.from({ length: cols }, (_, c) => (
              <Bone key={c} w={c === 0 ? "90" : "60"} h="0.95" />
            ))}
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** Admin edit pages: page head and form sections. */
export function AdminFormSkeleton({ label }: { label: string }) {
  return (
    <Busy label={label} className="admin-page" testId="admin-skeleton">
      <div className="admin-page-head">
        <Bone w="14r" h="1.75" />
      </div>
      {Array.from({ length: 3 }, (_, s) => (
        <div key={s} className="sk-stack sk-admin-section">
          <Bone w="9r" h="1.25" />
          <Bone w="6r" h="0.85" />
          <Bone h="2.75" shape="box" />
          <Bone w="6r" h="0.85" />
          <Bone h="2.75" shape="box" />
        </div>
      ))}
    </Busy>
  );
}
