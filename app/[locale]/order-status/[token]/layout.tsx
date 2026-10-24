// Decides "not found" before the loading skeleton streams (as p/[slug]/layout.tsx does), so a wrong or
// unknown guest link is a real 404 status, never a 200 page that only says "not found".
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/locales";
import { isGuestToken } from "@/lib/modules/orders/guest";
import { guestOrderLookup } from "./lookup";

export default async function GuestOrderLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale) || !isGuestToken(token)) notFound();
  if ((await guestOrderLookup(token))?.state === "not_found") notFound();
  return children;
}
