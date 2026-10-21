// The store's money formatter (DESIGN.md → Typography → Numbers and money). Not Intl defaults:
// ৳ before the number with no space; lakh grouping by default in both languages; poisha only when not zero.
// Amounts are integer minor units (poisha), as everywhere in SCHEMA.md.

export interface MoneyFormat {
  numerals: "bengali" | "latin";
  grouping: "south_asian" | "western";
}

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"] as const;
const MINUS = "\u2212";

export function toBengaliDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)] ?? d);
}

/** Groups an unsigned integer string: "1250000" → "12,50,000" (south_asian) or "1,250,000" (western). */
export function groupDigits(digits: string, grouping: MoneyFormat["grouping"]): string {
  if (!/^\d+$/.test(digits)) throw new Error("groupDigits expects digits only");
  if (grouping === "western" || digits.length <= 3) return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

/** Formats integer poisha as taka: 125000 → "৳১,২৫০" (bengali) or "৳1,250" (latin). */
export function formatMoney(amountMinor: number, format: MoneyFormat): string {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("formatMoney expects an integer amount in minor units");
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  let text = groupDigits(String(major), format.grouping);
  if (minor !== 0) text += `.${String(minor).padStart(2, "0")}`;
  if (format.numerals === "bengali") text = toBengaliDigits(text);
  return `${negative ? MINUS : ""}৳${text}`;
}

/** Formats a plain count with the same numerals and grouping (cart counts, quantities). */
export function formatCount(value: number, format: MoneyFormat): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("formatCount expects a non-negative integer");
  const text = groupDigits(String(value), format.grouping);
  return format.numerals === "bengali" ? toBengaliDigits(text) : text;
}

/** "/" uses the store's numerals setting; "/en" always uses Latin digits (DESIGN.md: ৳১,২৫০ on "/", ৳1,250 on "/en"). */
export function moneyFormatFor(locale: "bn" | "en", settings: MoneyFormat): MoneyFormat {
  return locale === "en" ? { ...settings, numerals: "latin" } : settings;
}
