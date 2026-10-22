// /account/rewards (B9; noindex; signed-in customer). Points balance, how points are earned and when
// they expire, and the history. Shown only while the store has rewards on (domain-rules §5.7).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { isLocale } from "@/lib/i18n/locales";
import { rewardSummary, rewardsOn } from "@/lib/modules/rewards/rewards";
import { getSettings } from "@/lib/modules/settings/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/rewards">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.rewards" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AccountRewardsPage({ params }: PageProps<"/[locale]/account/rewards">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/rewards");
  const db = identity.identity.db;
  const settings = await getSettings(db);
  if (!rewardsOn(settings)) notFound();
  const t = await getTranslations({ locale, namespace: "account.rewards" });
  const { balance, entries } = await rewardSummary(db, principal.user.id);
  const nf = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB");
  const date = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" });

  return (
    <AccountFrame locale={locale} current="rewards" title={t("title")} staff={principal.role !== null}>
      <p className="account-meta" data-testid="rewards-balance">
        {t("balance")}: <strong className="num">{t("points", { count: balance, n: nf.format(balance) })}</strong>
      </p>
      <p className="field-hint">{t("rules", { rate: nf.format(settings.rewards!.pointsPer100Taka), days: nf.format(settings.rewards!.expiryDays) })}</p>
      {entries.length === 0 ? (
        <p className="listing-empty-title" data-testid="rewards-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="cart-lines" data-testid="reward-history">
          {entries.map((e) => (
            <li key={String(e._id)} className="cart-line">
              <p className="cart-line-name">
                <span className="num">{e.points > 0 ? `+${nf.format(e.points)}` : `−${nf.format(-e.points)}`}</span> {t(`kinds.${e.kind}`)}
              </p>
              <p className="cart-line-variant">
                {date.format(e.createdAt)}
                {e.expiresAt ? ` · ${t("expires", { date: date.format(e.expiresAt) })}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AccountFrame>
  );
}
