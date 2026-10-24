// 404 inside the admin (staff-facing; noindex like every admin page). Offers the way back to admin home.
import { getTranslations } from "next-intl/server";
import { StatePage } from "@/components/states/StatePage";
import { ButtonLink } from "@/components/ui/Button";
import { adminLocale } from "@/lib/i18n/admin";

export default async function AdminNotFound() {
  const t = await getTranslations({ locale: adminLocale(), namespace: "notFound" });
  const shell = await getTranslations({ locale: adminLocale(), namespace: "admin.shell" });
  return (
    <StatePage state="not-found" title={t("title")}>
      <title>{t("title")}</title>
      <p className="state-body">{t("body")}</p>
      <p className="state-actions">
        <ButtonLink href="/admin" variant="secondary" prefetch={false}>
          {shell("backHome")}
        </ButtonLink>
      </p>
    </StatePage>
  );
}
