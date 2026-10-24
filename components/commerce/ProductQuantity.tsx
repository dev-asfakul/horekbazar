"use client";
// Product page quantity (Phase B): the shared stepper inside the existing Add to cart form. The value
// only travels with the form; the server still refuses more than is in stock, counting what is
// already in the cart (lib/modules/pricing/cart.ts addToCart).
import { useState } from "react";
import { QuantityStepper, type QuantityStepperLabels } from "@/components/commerce/QuantityStepper";

export function ProductQuantity({ max, labels }: { max: number; labels: QuantityStepperLabels }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="field pdp-qty">
      <QuantityStepper name="quantity" value={qty} min={1} max={Math.max(1, max)} onChange={setQty} labels={labels} testId="pdp-qty" />
    </div>
  );
}
