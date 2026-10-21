// Tier: build (concept). Use-when: showing any price, compare-at price or unit price. Avoid-when: totals that need a breakdown (use the summary rows, B6).
// Reduced-motion: prices never animate. Touch: not interactive.
// PriceTag (DESIGN.md → Components): price, an optional genuine compare-at price, and the unit price.
// The caller passes only real values from the catalogue; nothing is computed or invented here.
// A compare-at price is shown only when it is greater than the price (domain-rules: no fake discounts).
import { formatMoney, type MoneyFormat } from "@/lib/format/money";

export interface PriceTagProps {
  amountMinor: number;
  compareAtMinor?: number | undefined;
  /** Already-formatted unit price text from verified net quantity, e.g. "৳১২০/কেজি"; omitted when unverified. */
  unitPrice?: string | undefined;
  format: MoneyFormat;
  labels: { now: string; was: string };
  size?: "md" | "lg";
}

export function PriceTag({ amountMinor, compareAtMinor, unitPrice, format, labels, size = "md" }: PriceTagProps) {
  const showCompare = compareAtMinor !== undefined && compareAtMinor > amountMinor;
  return (
    <p className="price-tag" data-size={size}>
      <span className="sr-only">{labels.now} </span>
      <span className="price-tag-amount">{formatMoney(amountMinor, format)}</span>
      {showCompare ? (
        <>
          {" "}
          <span className="sr-only">{labels.was} </span>
          <s className="price-tag-compare">{formatMoney(compareAtMinor, format)}</s>
        </>
      ) : null}
      {unitPrice ? (
        <>
          {" "}
          <span className="price-tag-unit">{unitPrice}</span>
        </>
      ) : null}
    </p>
  );
}
