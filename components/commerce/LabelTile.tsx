// Tier: build (concept). Use-when: an image slot has no rights-cleared photo. Avoid-when: a real photo exists; never as decoration.
// Reduced-motion: static, nothing moves. Touch: not interactive; the surrounding entry is the target.
// LabelTile (DESIGN.md → Imagery → Missing image): the honest no-photo tile with the same 1:1 footprint.
// It shows the verified net quantity large and the category name small. With no verified net quantity
// it shows only the category name. It never says "photo coming soon" and never shows a stand-in photo.
export interface LabelTileProps {
  categoryName: string;
  /** Formatted verified net quantity, e.g. "৫ কেজি"; omit when the net quantity is not verified. */
  netQuantity?: string | undefined;
  size?: "grid" | "row";
}

export function LabelTile({ categoryName, netQuantity, size = "grid" }: LabelTileProps) {
  return (
    <div className="label-tile" data-size={size} role="img" aria-label={netQuantity ? `${netQuantity}, ${categoryName}` : categoryName}>
      {netQuantity ? <span className="label-tile-quantity" aria-hidden="true">{netQuantity}</span> : null}
      <span className="label-tile-category" aria-hidden="true">{categoryName}</span>
    </div>
  );
}
