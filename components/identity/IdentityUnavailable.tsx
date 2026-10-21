// Tier: build. Use-when: an identity page while accounts cannot work (database, AUTH_SECRET or site URL missing).
// Avoid-when: anything else. Reduced-motion: no motion. Touch: no controls.
// Database missing → the shared setup-required state. Otherwise a plain "not available yet" state;
// the variable names are shown only on the admin setup page, never on the storefront.
import { getTranslations } from "next-intl/server";
import { SetupRequired } from "@/components/states/SetupRequired";
import { StatePage } from "@/components/states/StatePage";
import type { IdentityUnavailable as Reason } from "@/lib/auth/server";
import { getSetupStatus } from "@/lib/setup/status";

export async function IdentityUnavailable({ locale, reason }: { locale: "bn" | "en"; reason: Reason }) {
  if (reason === "database") return <SetupRequired locale={locale} status={await getSetupStatus(process.env)} />;
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <StatePage state="accounts-unavailable" title={t("unavailableTitle")}>
      <p className="state-body">{t("unavailableBody")}</p>
    </StatePage>
  );
}
