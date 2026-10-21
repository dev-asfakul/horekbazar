// Bangladeshi mobile numbers (DESIGN.md → Forms: phone field). Accepts 01XXXXXXXXX with an optional
// +88 / 88 prefix, spaces or dashes, and Bengali digits; stores the 11-digit national form.
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function normalisePhone(raw: string): string | null {
  const ascii = raw.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  const digits = ascii.replace(/[\s-]/g, "").replace(/^\+?88/, "");
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}
