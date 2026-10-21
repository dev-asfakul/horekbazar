// 404 within a locale. The locale comes from the root param (next/root-params).
import * as rootParams from "next/root-params";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { StatePage } from "@/components/states/StatePage";
import { localeHref } from "@/lib/i18n/href";
import { defaultLocale, isLocale } from "@/lib/i18n/locales";

export default async function NotFound() {
  const param = await rootParams.locale();
  const locale = isLocale(param) ? param : defaultLocale;
  const t = await getTranslations({ locale, namespace: "notFound" });
  return (
    <StatePage state="not-found" title={t("title")}>
      <title>{t("title")}</title>
      <meta name="robots" content="noindex" />
      <p className="state-body">{t("body")}</p>
      <p className="state-actions">
        <ButtonLink href={localeHref(locale, "/")} variant="secondary" prefetch={false}>
          {t("action")}
        </ButtonLink>
      </p>
    </StatePage>
  );
}
