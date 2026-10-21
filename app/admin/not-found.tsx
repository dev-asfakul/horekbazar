// 404 inside the admin (staff-facing; noindex like every admin page).
import { getTranslations } from "next-intl/server";
import { StatePage } from "@/components/states/StatePage";
import { adminLocale } from "@/lib/i18n/admin";

export default async function AdminNotFound() {
  const t = await getTranslations({ locale: adminLocale(), namespace: "notFound" });
  return (
    <StatePage state="not-found" title={t("title")}>
      <title>{t("title")}</title>
      <p className="state-body">{t("body")}</p>
    </StatePage>
  );
}
