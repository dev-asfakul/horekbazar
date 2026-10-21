// Store date-time formatter: always the store timezone (Asia/Dhaka), Bengali digits on Bengali pages.
export function formatDateTime(date: Date, locale: "bn" | "en", timeZone = process.env.STORE_TIMEZONE?.trim() || "Asia/Dhaka"): string {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

export function formatTime(date: Date, locale: "bn" | "en", timeZone = process.env.STORE_TIMEZONE?.trim() || "Asia/Dhaka"): string {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { timeStyle: "short", timeZone }).format(date);
}
