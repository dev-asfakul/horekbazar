// /contact (B10). Phone, e-mail, address and opening hours come from the saved settings
// (`store.contact`, edited in /admin/settings); a missing value shows [NEEDS COPY]. The complaint
// procedure is legal text the owner has not supplied yet, so it is [NEEDS COPY] too. Signed-in
// customers can also write to the store from /account/messages (the "get help" journey, DESIGN.md).
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InfoPage, NeedsCopy } from "@/components/store/InfoPage";
import { SetupRequired } from "@/components/states/SetupRequired";
import { localeHref } from "@/lib/i18n/href";
import { loadStore, shown, shownLang } from "@/lib/storefront/context";
import { infoMetadata } from "@/lib/storefront/info";
import { localeOf } from "@/lib/storefront/page";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">) {
  const locale = localeOf((await params).locale);
  // The complaint procedure is still [NEEDS COPY], so the page is not indexed yet.
  return locale ? infoMetadata(locale, "contact", true) : {};
}

export default async function Page({ params }: PageProps<"/[locale]/contact">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store.info" });
  const { phone, email, address, hours } = store.settings.store.contact;
  const missing = <NeedsCopy locale={locale} />;
  return (
    <InfoPage page="contact" title={t("contact.title")}>
      <dl className="info-contact">
        <div>
          <dt>{t("contact.phone")}</dt>
          <dd data-testid="contact-phone">{phone ? <a className="prose-link" href={`tel:+88${phone}`}>{phone}</a> : missing}</dd>
        </div>
        <div>
          <dt>{t("contact.email")}</dt>
          <dd data-testid="contact-email">{email ? <a className="prose-link" href={`mailto:${email}`}>{email}</a> : missing}</dd>
        </div>
        <div>
          <dt>{t("contact.address")}</dt>
          <dd data-testid="contact-address">{address ? <span lang={shownLang(address, locale)}>{shown(address, locale)}</span> : missing}</dd>
        </div>
        <div>
          <dt>{t("contact.hours")}</dt>
          <dd data-testid="contact-hours">{hours ? <span lang={shownLang(hours, locale)}>{shown(hours, locale)}</span> : missing}</dd>
        </div>
      </dl>
      <section className="info-section" aria-labelledby="contact-complaints">
        <h2 id="contact-complaints" className="info-section-title">
          {t("contact.complaintsTitle")}
        </h2>
        <NeedsCopy locale={locale} />
      </section>
      <section className="info-section" aria-labelledby="contact-messages">
        <h2 id="contact-messages" className="info-section-title">
          {t("contact.messagesTitle")}
        </h2>
        <p>{t("contact.messagesBody")}</p>
        <p>
          <Link className="prose-link" href={localeHref(locale, "/account/messages")} prefetch={false}>
            {t("contact.messagesLink")}
          </Link>
        </p>
      </section>
    </InfoPage>
  );
}
