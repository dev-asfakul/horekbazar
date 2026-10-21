// /admin/settings (B4, settings.write). Store identity and contact, theme preset and accent (checked
// for 4.5:1 contrast on the page background), locale and numerals, price rounding and feature
// switches. Until the first save the store runs on the documented defaults (version 0).
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { updateGeneralSettingsAction } from "@/lib/actions/merch";
import { adminPage } from "@/lib/admin/page";
import { localizedFields, productFields } from "@/lib/admin/forms";
import { getAdminLocale } from "@/lib/auth/server";
import { getSettings, MIN_ACCENT_CONTRAST } from "@/lib/modules/settings/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.settings" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminSettingsPage() {
  const { locale, db, principal, messages } = await adminPage("/admin/settings");
  const t = await getTranslations({ locale, namespace: "admin.settings" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof productFields>[0];
  const s = await getSettings(db);
  const on = (b: boolean) => (b ? "on" : "");
  return (
    <div className="admin-page" data-testid="admin-settings" data-version={s.version}>
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      {s.version === 0 ? <p className="admin-notice">{t("defaults")}</p> : null}
      {principal.role?.capabilities.has("delivery.write") ? (
        <p>
          <Link className="prose-link" href="/admin/settings/delivery">
            {t("deliveryLink")}
          </Link>
        </p>
      ) : null}
      <section className="admin-section">
        <ActionForm
          action={updateGeneralSettingsAction}
          testId="settings-form"
          layout="grid"
          hidden={{ version: String(s.version) }}
          messages={messages}
          submitLabel={c("save")}
          pendingLabel={c("saving")}
          fields={[
            ...localizedFields(ct, "name", t("storeName"), s.store.name, { required: true, max: 60 }),
            { name: "phone", label: t("phone"), hint: t("phoneHint"), type: "tel", defaultValue: s.store.contact.phone ?? "", autoComplete: "off" },
            { name: "email", label: t("email"), type: "email", defaultValue: s.store.contact.email ?? "", autoComplete: "off" },
            ...localizedFields(ct, "address", t("address"), s.store.contact.address, { max: 300, textarea: true }),
            ...localizedFields(ct, "hours", t("hours"), s.store.contact.hours, { max: 120 }),
            { name: "fontPreset", label: t("fontPreset"), type: "select", defaultValue: s.theme.fontPreset, options: [{ value: "khata", label: t("fontKhata") }, { value: "plain", label: t("fontPlain") }] },
            { name: "accent", label: t("accent"), hint: t("accentHint", { ratio: String(MIN_ACCENT_CONTRAST) }), defaultValue: s.theme.accent, maxLength: 7, autoComplete: "off" },
            { name: "defaultLocale", label: t("defaultLocale"), type: "select", defaultValue: s.locale.default, options: [{ value: "bn", label: "বাংলা" }, { value: "en", label: "English" }] },
            { name: "numerals", label: t("numerals"), type: "select", defaultValue: s.locale.numerals, options: [{ value: "bengali", label: t("numeralsBengali") }, { value: "latin", label: t("numeralsLatin") }] },
            { name: "grouping", label: t("grouping"), type: "select", defaultValue: s.locale.grouping, options: [{ value: "south_asian", label: t("groupingSouthAsian") }, { value: "western", label: t("groupingWestern") }] },
            { name: "roundingUnit", label: t("roundingUnit"), hint: t("roundingHint"), type: "number", inputMode: "numeric", defaultValue: String(s.pricing.roundingUnit) },
            { name: "wishlist", label: t("featureWishlist"), type: "checkbox", defaultValue: on(s.features.wishlist), wide: true },
            { name: "brands", label: t("featureBrands"), type: "checkbox", defaultValue: on(s.features.brands), wide: true },
            { name: "reviews", label: t("featureReviews"), type: "checkbox", defaultValue: on(s.features.reviews), wide: true },
          ]}
        />
      </section>
    </div>
  );
}
