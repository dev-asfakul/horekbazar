# Proposed taxonomy (DRAFT, pending owner review)

## Market signals used

Figures differ between sources and measure different things (revenue, share of buyers, number of stores). They are used only to choose a balanced starting mix, not as forecasts.

| Signal | Source | What it says |
|---|---|---|
| Revenue share by category | [DHL, citing ECDB](https://www.dhl.com/discover/en-bd/e-commerce-advice/e-commerce-trends/what-is-e-commerce-2025-blangladeshi-trends) | Electronics 23.9%, hobby & leisure 20.4%, fashion 18.9%, furniture & homeware 12.1%, care products 9.0%, DIY 7.5% |
| What online buyers bought | [BSS reporting the BBS ICT Access and Use survey 2024–25](https://www.bssnews.net/special-stories/391786) | 14.4% of individuals bought online; clothing/footwear/sporting goods 70.3%, food and groceries 34.6%, medicine 21.0%, cosmetics 17.9%, household goods 10.9%, IT/electronics 8.7% |
| Same survey, different summary | [DCIF](https://dcif.bd/ecommerce-update-data-2026-published-by-dcif-bbs2024-2025/) | Clothing 77.6%, cosmetics 26.4%, books 17.1%, food 17.1%, household 11.8%. **Discrepancy with BSS is unresolved**; the official BBS report should be read before relying on either. |
| Share of online stores | [ShopRank](https://shoprank.com/countries/bangladesh) | Clothing 23.5%, health & beauty 16.3%, electronics 13.1%, food & beverages 12.5%, home & garden 4.8% (store counts, not sales) |

**Reading:** fashion and everyday groceries are the most common purchases; electronics leads by revenue; personal care and household goods are steady. A general single-store shop that starts with groceries/staples, personal care, home, fashion basics and low-risk electronics accessories matches these signals without needing high-value, high-risk stock.

## Proposed tree (9 top-level, 30 leaf categories)

| Top level (bn / en) | Leaf categories | Products |
|---|---|---:|
| মুদি ও নিত্যপণ্য / Grocery & Staples | Rice & Flour · Lentils & Pulses · Oil & Ghee · Spices · Sugar, Salt & Sweeteners · Tea, Coffee & Milk · Snacks & Noodles | 45 |
| ব্যক্তিগত যত্ন / Personal Care | Skin Care · Hair Care · Oral & Bath · Grooming & Hygiene | 19 |
| ঘর পরিষ্কার / Home Cleaning | Laundry · Dishwashing · Floor, Surface & Toilet · Cleaning Tools | 12 |
| রান্নাঘর ও ডাইনিং / Kitchen & Dining | Cookware · Kitchen Tools & Storage · Tableware & Drinkware | 14 |
| ঘর ও জীবনযাপন / Home & Living | Bedding & Bath Linen · Home Essentials | 9 |
| ফ্যাশন / Fashion | Men's Clothing · Women's Clothing · Footwear & Accessories | 14 |
| ইলেকট্রনিক্স ও এক্সেসরিজ / Electronics & Accessories | Mobile Accessories · Lighting & Power · Small Appliances | 15 |
| শিশু ও কিশোর / Baby & Kids | Baby Care · School Essentials | 6 |
| স্টেশনারি ও অফিস / Stationery & Office | Paper & Notebooks · Writing & Office Supplies | 10 |

Rules applied: the approved contract allows a category tree **up to 3 levels**; this proposal uses **2 levels** (department → leaf category), leaving the third level unused until the owner needs it; products attach to leaf categories; slugs are stable lowercase Latin and shared by `/` (Bengali) and `/en` (D10); category codes (GRC, PCR, HCL, KIT, HOM, FSH, ELC, KID, STN) appear in SKUs.

## Excluded from the starter set (owner may revisit)

| Excluded | Reason |
|---|---|
| Medicines, OTC drugs, supplements with health claims | Drug licensing and DGDA rules; high liability **[L]** |
| Fresh fish, meat, eggs, vegetables, fruit | Cold chain, daily price swings, quality inspection; COD returns of perishables. TCB tracks these, but prices move daily |
| Smartphones, laptops, TVs, large appliances | High value on COD, warranty and authenticity obligations, import/type-approval questions, fraud risk |
| LPG cylinders, aerosols in bulk, insecticides and pesticides | Hazardous goods for couriers; registration rules **[L]** |
| Tobacco, vapes, alcohol, weapons, live animals | Legal restrictions or unsuitable for a general store |
| Cosmetics with treatment claims (whitening, anti-acne, etc.) | Claims need regulatory evidence; only neutral everyday items are proposed |
| Gold and jewellery | Reported as BSTI-mandatory; high value and purity verification |
| Toys | BSTI toy-safety standards (BDS ISO 8124) appear in recent lists; deferred until standards are checked |

## Open questions for the owner

1. Is grocery (45 products, the largest group) the right anchor, or should HorekBazar lead with fashion or home goods?
2. Should any excluded group (for example fresh produce for a limited delivery zone) be added later?
3. Which brands will actually be stocked? Brand choice changes names, prices and compliance for most products.
