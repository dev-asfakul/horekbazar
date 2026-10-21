// 403 for admin pages (DESIGN.md → Permission state: a 403 page naming the capability). The capability
// comes from the same page table the gate uses (ADMIN_PAGE_CAPABILITY), keyed by the path the proxy
// passes in. Shows who is signed in so a staff member on the wrong account can switch.
import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { StatePage } from "@/components/states/StatePage";
import { getAdminLocale, getPrincipal } from "@/lib/auth/server";
import { ADMIN_PATH_HEADER, adminPageCapability } from "@/lib/modules/identity/paths";

export default async function AdminForbidden() {
  const locale = await getAdminLocale();
  const t = await getTranslations({ locale, namespace: "admin.denied" });
  const path = (await headers()).get(ADMIN_PATH_HEADER);
  const capability = adminPageCapability(path);
  const principal = await getPrincipal();
  return (
    <StatePage state="forbidden" title={t("title")}>
      <title>{t("title")}</title>
      <p className="state-body">{capability ? t("body", { capability }) : t("bodyStaff")}</p>
      {principal ? (
        <>
          <p className="state-meta">{t("signedInAs", { email: principal.user.email })}</p>
          <p className="state-actions">
            <Link className="prose-link" href={`/login?next=${encodeURIComponent(path ?? "/admin")}`}>
              {t("switch")}
            </Link>
          </p>
        </>
      ) : null}
    </StatePage>
  );
}
