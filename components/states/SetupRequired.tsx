// Tier: build (contract D2). Use-when: any database-backed page while the database is not connected. Avoid-when: any page that does not need the database.
// Reduced-motion: no motion. Touch: no controls.
// SetupRequired (#setup-required; contract D2): shown by every database-backed page until the
// database is connected. There is no fallback data. Shoppers read that the store is being set up;
// the block for the person running the store names the missing variables (names only, never values).
// Proposed: from B3 the variable list can be limited to signed-in staff.
import { getTranslations } from "next-intl/server";
import { StatePage } from "@/components/states/StatePage";
import type { Locale } from "@/lib/i18n/locales";
import type { SetupStatus } from "@/lib/setup/status";

export async function SetupRequired({ locale, status }: { locale: Locale; status: SetupStatus }) {
  const t = await getTranslations({ locale, namespace: "setup" });
  return (
    <div id="setup-required" className="contents">
      <StatePage state="setup-required" title={t("title")}>
        <p className="state-body">{t("body")}</p>
        <div className="setup-owner">
          <h2 className="setup-owner-title">{t("ownerHeading")}</h2>
          <p>{t("ownerBody")}</p>
          {status.missing.length > 0 ? (
            <>
              <p className="mt-3">{t("missing")}</p>
              <ul className="setup-vars" lang="en">
                {status.missing.map((name) => (
                  <li key={name}>
                    <code>{name}</code>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {status.invalid.length > 0 ? (
            <>
              <p className="mt-3">{t("invalid")}</p>
              <ul className="setup-vars" lang="en">
                {status.invalid.map((name) => (
                  <li key={name}>
                    <code>{name}</code>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </StatePage>
    </div>
  );
}
