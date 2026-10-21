// /admin/banners (B4, merch.write). A banner is an uploaded image (Cloudinary signed upload; the
// public id must sit in the banners folder) with alt text, recorded rights, an internal link, a
// placement and an optional visibility window (Asia/Dhaka time). Without Cloudinary: a notice.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { AdminImage, StatusChip } from "@/components/admin/RecordBits";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { createBannerAction, deleteBannerAction, setBannerStatusAction, updateBannerAction } from "@/lib/actions/merch";
import { dhakaDateTimeText } from "@/lib/actions/staff-action";
import { adminPage, count, lt } from "@/lib/admin/page";
import { localizedFields, productFields } from "@/lib/admin/forms";
import { getAdminLocale } from "@/lib/auth/server";
import { cloudinaryConfig, deliveryUrl } from "@/lib/adapters/media/cloudinary";
import { listBanners } from "@/lib/modules/merch/merch";
import { BANNER_PLACEMENTS, type BannerDoc } from "@/lib/modules/merch/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.banners" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminBannersPage() {
  const { locale, db, messages } = await adminPage("/admin/banners");
  const t = await getTranslations({ locale, namespace: "admin.banners" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof productFields>[0];
  const banners = await listBanners(db);
  const cloud = cloudinaryConfig();
  const detailFields = (b?: BannerDoc): FieldSpec[] => [
    ...localizedFields(ct, "alt", c("fields.alt"), b?.alt, { required: true, max: 200 }),
    { name: "rights", label: c("fields.rights"), hint: c("fields.rightsHint"), required: true, defaultValue: b?.image.rights ?? "", maxLength: 300, wide: true },
    { name: "placement", label: t("placement"), type: "select", defaultValue: b?.placement ?? "home_top", options: BANNER_PLACEMENTS.map((p) => ({ value: p, label: t(`placements.${p}`) })) },
    { name: "href", label: t("href"), hint: t("hrefHint"), defaultValue: b?.href ?? "", maxLength: 300, autoComplete: "off" },
    { name: "visibleFrom", label: c("fields.visibleFrom"), type: "datetime-local", defaultValue: dhakaDateTimeText(b?.visibleFrom) },
    { name: "visibleTo", label: c("fields.visibleTo"), type: "datetime-local", defaultValue: dhakaDateTimeText(b?.visibleTo) },
  ];

  return (
    <div className="admin-page" data-testid="admin-banners">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <section className="admin-section" aria-labelledby="list-title">
        <h2 id="list-title" className="admin-section-title">
          {t("listTitle", { count: count(banners.length) })}
        </h2>
        {banners.length === 0 ? (
          <div className="admin-empty" data-testid="banners-empty">
            <p className="admin-empty-title">{t("empty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {banners.map((b) => {
              const hidden = { id: String(b._id), version: String(b.version), publicId: b.image.publicId, width: String(b.image.width ?? ""), height: String(b.image.height ?? "") };
              return (
                <li key={String(b._id)} className="staff-row media-row">
                  {cloud ? <AdminImage src={deliveryUrl(cloud.cloudName, b.image.publicId, 160)} alt={lt(b.alt, locale)} size={80} /> : null}
                  <div>
                    <p className="staff-name">{lt(b.alt, locale)}</p>
                    <p className="record-chips">
                      <StatusChip tone={b.status} label={c(`statuses.${b.status}`)} />
                      <span className="record-sub">{t(`placements.${b.placement}`)}</span>
                    </p>
                    <details className="staff-manage">
                      <summary>{c("manage")}</summary>
                      <div className="form-actions status-actions">
                        {b.status !== "published" ? <ActionForm action={setBannerStatusAction} hidden={{ ...hidden, status: "published" }} fields={[]} messages={messages} submitLabel={c("publish")} pendingLabel={c("saving")} layout="inline" /> : null}
                        {b.status === "published" ? <ActionForm action={setBannerStatusAction} hidden={{ ...hidden, status: "draft" }} fields={[]} messages={messages} submitLabel={c("unpublish")} pendingLabel={c("saving")} variant="secondary" layout="inline" /> : null}
                        {b.status !== "archived" ? <ActionForm action={setBannerStatusAction} hidden={{ ...hidden, status: "archived" }} fields={[]} messages={messages} submitLabel={c("archive")} pendingLabel={c("saving")} variant="secondary" layout="inline" /> : null}
                      </div>
                      <ActionForm action={updateBannerAction} layout="grid" hidden={hidden} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={detailFields(b)} />
                      <ActionForm action={deleteBannerAction} hidden={hidden} messages={messages} submitLabel={c("delete")} pendingLabel={c("saving")} variant="danger" fields={[{ name: "confirm", label: c("deleteConfirm"), type: "checkbox", required: true }]} />
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="admin-section" aria-labelledby="add-title">
        <h2 id="add-title" className="admin-section-title">
          {t("addTitle")}
        </h2>
        {cloud ? (
          <MediaUploader
            purpose="banner"
            action={createBannerAction}
            hidden={{}}
            messages={messages}
            testId="banner-upload"
            fields={detailFields()}
            labels={{
              file: c("upload.file"),
              fileHint: c("upload.fileHint"),
              uploading: c("upload.uploading"),
              uploaded: c("upload.uploaded"),
              failed: c("upload.failed"),
              notConfigured: c("upload.notConfigured"),
              tooLarge: c("upload.tooLarge"),
              submit: t("addSubmit"),
              pending: c("saving"),
            }}
          />
        ) : (
          <p className="admin-notice" data-testid="media-not-configured">
            {t("notConfigured")}
          </p>
        )}
      </section>
    </div>
  );
}
