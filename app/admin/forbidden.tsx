// 403 for admin pages (DESIGN.md → Permission state: a 403 page naming the capability).
import { getTranslations } from "next-intl/server";
import { StatePage } from "@/components/states/StatePage";
import { adminLocale } from "@/lib/i18n/admin";

export default async function AdminForbidden() {
  const t = await getTranslations({ locale: adminLocale(), namespace: "admin.denied" });
  return (
    <StatePage state="forbidden" title={t("title")}>
      <title>{t("title")}</title>
      <p className="state-body">{t("body", { capability: "platform.read" })}</p>
    </StatePage>
  );
}
