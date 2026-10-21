// next-intl request configuration. The locale comes from the [locale] root segment through
// next/root-params (available by default from Next.js 16.3). Routing itself stays in proxy.ts
// (locale rewrite, canonical redirect, nonce CSP); next-intl's middleware is not used.
import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { isLocale } from "@/lib/i18n/locales";
import bn from "@/messages/bn.json";
import en from "@/messages/en.json";

const messages = { bn, en } as const;

export default getRequestConfig(async ({ locale }) => {
  let resolved = locale;
  if (!resolved) {
    const param = await rootParams.locale();
    if (!isLocale(param)) notFound();
    resolved = param;
  }
  if (!isLocale(resolved)) notFound();
  return { locale: resolved, messages: messages[resolved], timeZone: "Asia/Dhaka" };
});
