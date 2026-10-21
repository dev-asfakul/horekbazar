# Price research (DRAFT, every price needs owner review)

## Summary

- **235 variant prices**, all with `ownerReviewRequired: true`. None is a confirmed selling price.
- **39** are `reference_derived`: computed from the official [TCB Dhaka retail price list of 26 February 2026](https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-tcb/2026/2/7293ed5e-e6f0-4363-a008-6c10ac973876.xlsx) (serial 053; markets: Karwan Bazar, Mirpur-6, Mohammadpur Town Hall, New Market, Mohakhali).
- **196** are `estimate_requires_owner_review`: agent placeholders with **no source**. They exist only so the owner can see a complete shape; they must be replaced with prices based on real supplier cost and margin.
- No "compare-at", "was" or discount prices are proposed. Promotions are configured later by staff (`docs/domain-rules.md` §5).

## Method for reference-derived prices

1. Take the TCB min–max range for the matching item and unit (for example "চাল সরু (নাজির/মিনিকেট), per kg: Tk 70–85").
2. Multiply by pack size (5 kg rice → Tk 350–425; 100 g cumin → 0.1 × Tk 580–700 = Tk 58–70).
3. Proposed price = upper bound rounded **up** to the nearest Tk 5, stored in integer poisha.

### Caveats

- TCB ranges are **market retail prices for loose or common goods in Dhaka**, not online selling prices. They exclude packaging, delivery, payment handling and margin, and they do not reflect brand premiums.
- The data is **about 8 months old**. The TCB daily price page ([daily](https://tcb.gov.bd/pages/daily-rmps), [last 30 days](https://tcb.gov.bd/pages/last30-rmps)) returned HTTP 502 on 2026-10-21, so the latest file could not be retrieved.
- Recent news citing TCB corroborates the rice ranges: fine rice Tk 72–85/kg and branded 5 kg packs Tk 480–525 ([bdnews24, 21 Oct 2026](https://bangla.bdnews24.com/business/8cvkcviywm)); coarse rice Tk 50–55, medium Tk 58–65 ([bdtoday, 20 Oct 2026](https://bdtoday.net/news/national/144676)). These are not used in calculations. Other staples (oil, lentils, spices, sugar) may have moved since February.
- **Milk powder:** the TCB range (Tk 720–920/kg) spans four named brands. The real price depends on which brand is stocked.
- **Soybean oil:** bottled soybean oil prices have at times been set by government and refiners. Check the current official price before listing.
- **Writing paper:** TCB prices it per "দিস্তা"; the sheet count must be confirmed with the supplier.
- Under the Digital Commerce guidelines (as summarised in `docs/domain-rules.md` §15 **[L]**), the full price and all charges must be shown. The storefront shows the final price in ৳ including VAT where applicable; delivery is shown separately at checkout.

## Owner actions

1. Replace every `estimate_requires_owner_review` price with a price from real supplier quotes.
2. Re-check every `reference_derived` price against the latest TCB list and your actual cost.
3. Record in `review.notes` who set the price and when. Only then can a record be marked approved (see [`REVIEW-CHECKLIST.md`](REVIEW-CHECKLIST.md)).

## Full price list

Every variant, with status, is in [`prices.csv`](prices.csv). It is regenerated with `node catalogue/horekbazar/tools/catalogue.mjs report`.

## Reference-derived prices (generated table)

<!-- price-table:start -->
| SKU | Product | Variant | Status | Proposed ৳ | Reference range ৳ | Basis |
|---|---|---|---|---:|---|---|
| HB-GRC-001-1KG | Miniket Rice | 1 kg | reference_derived | 85 | 70–85 | TCB চাল সরু (নাজির/মিনিকেট), per kg × 1 |
| HB-GRC-001-5KG | Miniket Rice | 5 kg | reference_derived | 425 | 350–425 | TCB চাল সরু (নাজির/মিনিকেট), per kg × 5 |
| HB-GRC-001-10KG | Miniket Rice | 10 kg | reference_derived | 850 | 700–850 | TCB চাল সরু (নাজির/মিনিকেট), per kg × 10 |
| HB-GRC-002-1KG | Nazirshail Rice | 1 kg | reference_derived | 85 | 70–85 | TCB চাল সরু (নাজির/মিনিকেট), per kg × 1 |
| HB-GRC-002-5KG | Nazirshail Rice | 5 kg | reference_derived | 425 | 350–425 | TCB চাল সরু (নাজির/মিনিকেট), per kg × 5 |
| HB-GRC-003-5KG | Medium Rice (Paijam / BRRI-28) | 5 kg | reference_derived | 340 | 290–340 | TCB চাল (মাঝারী) পাইজাম/আটাশ, per kg × 5 |
| HB-GRC-003-10KG | Medium Rice (Paijam / BRRI-28) | 10 kg | reference_derived | 680 | 580–680 | TCB চাল (মাঝারী) পাইজাম/আটাশ, per kg × 10 |
| HB-GRC-004-5KG | Coarse Rice (Swarna) | 5 kg | reference_derived | 300 | 250–300 | TCB চাল (মোটা)/স্বর্ণা/চায়না ইরি, per kg × 5 |
| HB-GRC-004-10KG | Coarse Rice (Swarna) | 10 kg | reference_derived | 600 | 500–600 | TCB চাল (মোটা)/স্বর্ণা/চায়না ইরি, per kg × 10 |
| HB-GRC-006-1KG | Wheat Atta (Packet) | 1 kg | reference_derived | 65 | 55–62 | TCB আটা (প্যাকেট), per kg packet × 1 |
| HB-GRC-006-2KG | Wheat Atta (Packet) | 2 kg | reference_derived | 125 | 110–124 | TCB আটা (প্যাকেট), per kg packet × 2 |
| HB-GRC-007-1KG | Maida (Packet) | 1 kg | reference_derived | 75 | 65–75 | TCB ময়দা (প্যাকেট), per kg packet × 1 |
| HB-GRC-007-2KG | Maida (Packet) | 2 kg | reference_derived | 150 | 130–150 | TCB ময়দা (প্যাকেট), per kg packet × 2 |
| HB-GRC-010-1KG | Masoor Dal (Small Grain) | 1 kg | reference_derived | 160 | 150–160 | TCB মশুর ডাল (ছোট দানা), per kg × 1 |
| HB-GRC-011-1KG | Masoor Dal (Medium Grain) | 1 kg | reference_derived | 120 | 110–120 | TCB মশুর ডাল (মাঝারী দানা), per kg × 1 |
| HB-GRC-012-1KG | Masoor Dal (Bold Grain) | 1 kg | reference_derived | 105 | 85–105 | TCB মশুর ডাল (বড় দানা), per kg × 1 |
| HB-GRC-013-500G | Moong Dal | 500 g | reference_derived | 90 | 60–90 | TCB মুগ ডাল (মানভেদে), per kg × 0.5 |
| HB-GRC-013-1KG | Moong Dal | 1 kg | reference_derived | 180 | 120–180 | TCB মুগ ডাল (মানভেদে), per kg × 1 |
| HB-GRC-014-1KG | Anchor Dal (Split Peas) | 1 kg | reference_derived | 75 | 50–75 | TCB এ্যাংকর ডাল, per kg × 1 |
| HB-GRC-015-500G | Chhola (Chickpeas) | 500 g | reference_derived | 50 | 40–47.5 | TCB ছোলা (মানভেদে), per kg × 0.5 |
| HB-GRC-015-1KG | Chhola (Chickpeas) | 1 kg | reference_derived | 95 | 80–95 | TCB ছোলা (মানভেদে), per kg × 1 |
| HB-GRC-017-1L | Soybean Oil (Bottle) | 1 litre | reference_derived | 195 | 190–195 | TCB সয়াবিন তেল (বোতল) ১ লিটার, 1 litre bottle × 1 |
| HB-GRC-017-2L | Soybean Oil (Bottle) | 2 litre | reference_derived | 395 | 385–395 | TCB সয়াবিন তেল (বোতল) ২ লিটার, 2 litre bottle × 1 |
| HB-GRC-017-5L | Soybean Oil (Bottle) | 5 litre | reference_derived | 955 | 920–955 | TCB সয়াবিন তেল (বোতল) ৫ লিটার, 5 litre bottle × 1 |
| HB-GRC-018-5L | Rice Bran Oil (Bottle) | 5 litre | reference_derived | 1080 | 1030–1080 | TCB রাইস ব্রান তেল (বোতল) ৫ লিটার, 5 litre bottle × 1 |
| HB-GRC-024-100G | Cumin Seeds (Whole) | 100 g | reference_derived | 70 | 58–70 | TCB জিরা, per kg × 0.1 |
| HB-GRC-024-250G | Cumin Seeds (Whole) | 250 g | reference_derived | 175 | 145–175 | TCB জিরা, per kg × 0.25 |
| HB-GRC-025-100G | Cinnamon | 100 g | reference_derived | 60 | 48–60 | TCB দারুচিনি, per kg × 0.1 |
| HB-GRC-026-50G | Cloves | 50 g | reference_derived | 80 | 67.5–80 | TCB লবঙ্গ, per kg × 0.05 |
| HB-GRC-027-50G | Green Cardamom (Small) | 50 g | reference_derived | 275 | 225–275 | TCB এলাচ (ছোট), per kg × 0.05 |
| HB-GRC-028-100G | Bay Leaves | 100 g | reference_derived | 25 | 16–22 | TCB তেজপাতা, per kg × 0.1 |
| HB-GRC-029-250G | Dried Red Chilli (Whole) | 250 g | reference_derived | 75 | 62.5–75 | TCB শুকনা মরিচ (দেশী), per kg × 0.25 |
| HB-GRC-032-1KG | Sugar | 1 kg | reference_derived | 105 | 98–105 | TCB চিনি, per kg × 1 |
| HB-GRC-033-1KG | Iodised Salt | 1 kg | reference_derived | 45 | 38–42 | TCB লবণ (প্যাঃ) আয়োডিনযুক্ত, per kg packet × 1 |
| HB-GRC-035-500G | Dates | 500 g | reference_derived | 250 | 150–250 | TCB খেজুর (সাধারণ মানের), per kg × 0.5 |
| HB-GRC-035-1KG | Dates | 1 kg | reference_derived | 500 | 300–500 | TCB খেজুর (সাধারণ মানের), per kg × 1 |
| HB-GRC-039-500G | Full Cream Milk Powder | 500 g | reference_derived | 460 | 360–460 | TCB গুড়া দুধ (প্যাকেটজাত), ব্র্যান্ডভেদে, per kg (range across four listed brands) × 0.5 |
| HB-GRC-039-1KG | Full Cream Milk Powder | 1 kg | reference_derived | 920 | 720–920 | TCB গুড়া দুধ (প্যাকেটজাত), ব্র্যান্ডভেদে, per kg (range across four listed brands) × 1 |
| HB-STN-001-1D | White Writing Paper (1 Dista) | 1 dista | reference_derived | 40 | 34–40 | TCB লেখার কাগজ (সাদা), per dista × 1 |
<!-- price-table:end -->
