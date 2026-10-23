// /admin/products/[id] (B4, catalogue.write): edit the product, its variants and images, and move it
// between draft, published and archived. Publishing needs a published primary category and one
// active variant with a price (service rule). Without a photo the product shows its LabelTile.
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LabelTile } from "@/components/commerce/LabelTile";
import { AiDraftsPanel } from "@/components/admin/AiDraftsPanel";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { AdminImage, SampleBadge, StatusChip } from "@/components/admin/RecordBits";
import { ActionForm } from "@/components/forms/ActionForm";
import {
  addProductMediaAction,
  createVariantAction,
  deleteProductAction,
  removeProductMediaAction,
  setProductStatusAction,
  setVariantStatusAction,
  updateProductAction,
  updateVariantAction,
} from "@/lib/actions/catalogue";
import { adminPage, count, lt, money } from "@/lib/admin/page";
import { categoryOptions, localizedFields, productFields, variantFields } from "@/lib/admin/forms";
import { getAdminLocale } from "@/lib/auth/server";
import { aiConfig } from "@/lib/adapters/ai/gemini";
import { cloudinaryConfig, deliveryUrl } from "@/lib/adapters/media/cloudinary";
import { listCategories } from "@/lib/modules/catalogue/categories";
import { isDevelopmentDatabase } from "@/lib/modules/catalogue/common";
import { getProduct } from "@/lib/modules/catalogue/products";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.products" });
  return { title: t("editTitle"), robots: { index: false, follow: false } };
}

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProductPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const { locale, db, messages } = await adminPage("/admin/products", `/admin/products/${id}`);
  const found = await getProduct(db, id);
  if (!found) notFound();
  const { product, variants } = found;
  const t = await getTranslations({ locale, namespace: "admin.products" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof productFields>[0];
  const categories = await listCategories(db);
  const options = categoryOptions(categories, locale);
  const primary = categories.find((cat) => String(cat._id) === String(product.primaryCategoryId));
  const cloud = cloudinaryConfig();
  const ai = aiConfig();
  const hidden = { id, version: String(product.version) };
  const firstVerified = variants.find((v) => v.variant.status === "active" && v.variant.netQuantity?.verified)?.variant.netQuantity;
  const netText = firstVerified ? `${firstVerified.value} ${c(`units.${firstVerified.unit}`)}` : undefined;
  const statusForm = (status: "draft" | "published" | "archived", label: string, variant: "primary" | "secondary" | "danger") => (
    <ActionForm key={status} action={setProductStatusAction} hidden={{ ...hidden, status }} fields={[]} messages={messages} submitLabel={label} pendingLabel={c("saving")} variant={variant} layout="inline" testId={`product-status-${status}`} />
  );

  return (
    <div className="admin-page" data-testid="admin-product" data-status={product.status} data-version={product.version}>
      <p className="admin-breadcrumb">
        <Link className="prose-link" href="/admin/products">
          {t("title")}
        </Link>
      </p>
      <div className="admin-page-head">
        <div>
          <h1 className="font-display admin-title">{lt(product.name, locale)}</h1>
          <p className="record-chips">
            <StatusChip tone={product.status} label={c(`statuses.${product.status}`)} />
            {product.sample ? <SampleBadge label={c("sample")} title={c("sampleTitle")} /> : null}
            <span className="record-sub" lang="en">
              {product.slug}
            </span>
          </p>
        </div>
      </div>
      {sp.created ? (
        <p role="status" className="form-success admin-flash">
          {t("created")}
        </p>
      ) : null}
      {product.sample ? <p className="admin-notice">{isDevelopmentDatabase(db) ? c("sampleNoticeDev") : c("sampleNoticeBlocked")}</p> : null}

      <section className="admin-section product-overview" aria-labelledby="preview-title">
        <h2 id="preview-title" className="admin-section-title">
          {t("preview")}
        </h2>
        <div className="product-preview" data-testid="product-preview">
          {product.media[0] && cloud ? (
            <AdminImage className="product-preview-image" src={deliveryUrl(cloud.cloudName, product.media[0].publicId, 480)} alt={lt(product.media[0].alt, locale)} size={240} lazy={false} />
          ) : (
            <LabelTile categoryName={primary ? lt(primary.name, locale) : ""} netQuantity={netText} />
          )}
          <p className="field-hint">{product.media[0] ? t("previewPhoto") : netText ? t("previewLabelTile") : t("previewLabelTileNoQuantity")}</p>
        </div>
        <div className="form-actions status-actions">
          {product.status !== "published" ? statusForm("published", t("publish"), "primary") : null}
          {product.status === "published" ? statusForm("draft", t("unpublish"), "secondary") : null}
          {product.status === "archived" ? statusForm("draft", t("restore"), "secondary") : null}
          {product.status !== "archived" ? statusForm("archived", t("archive"), "secondary") : null}
        </div>
        <p className="field-hint">{t("publishRule")}</p>
      </section>

      <section className="admin-section" aria-labelledby="details-title">
        <h2 id="details-title" className="admin-section-title">
          {t("details")}
        </h2>
        {product.publishedAt ? <p className="field-hint">{t("slugFrozen")}</p> : null}
        <ActionForm action={updateProductAction} testId="product-edit-form" layout="grid" hidden={hidden} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={productFields(ct, options, product)} />
      </section>

      {ai ? <AiDraftsPanel db={db} product={product} config={ai} messages={messages} locale={locale} /> : null}

      <section className="admin-section" aria-labelledby="variants-title">
        <h2 id="variants-title" className="admin-section-title">
          {t("variantsTitle")}
        </h2>
        <p className="field-hint">{t("variantsIntro")}</p>
        {variants.length === 0 ? (
          <p className="admin-empty-title" data-testid="variants-empty">
            {t("noVariants")}
          </p>
        ) : (
          <ul className="staff-rows" data-testid="variant-rows">
            {variants.map(({ variant: v, stock }) => (
              <li key={String(v._id)} className="staff-row" data-sku={v.sku}>
                <p className="staff-name">
                  {lt(v.title, locale)} <span className="record-sub" lang="en">{v.sku}</span>
                </p>
                <p className="record-chips">
                  <StatusChip tone={v.status} label={c(`variantStatuses.${v.status}`)} />
                  <span>{money(v.price.amountMinor)}</span>
                  {v.compareAt ? <s className="record-sub">{money(v.compareAt.amountMinor)}</s> : null}
                  <span className="record-sub">{t("stockLine", { available: count(stock?.available ?? 0), onHand: count(stock?.onHand ?? 0) })}</span>
                  {v.netQuantity ? <span className="record-sub">{`${v.netQuantity.value} ${c(`units.${v.netQuantity.unit}`)}`} · {v.netQuantity.verified ? t("netVerified") : t("netUnverified")}</span> : null}
                  {v.sample ? <SampleBadge label={c("sample")} title={c("sampleTitle")} /> : null}
                </p>
                <details className="staff-manage">
                  <summary>{t("editVariant")}</summary>
                  <ActionForm action={updateVariantAction} layout="grid" hidden={{ id: String(v._id), version: String(v.version) }} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={variantFields(ct, v)} />
                  <ActionForm
                    action={setVariantStatusAction}
                    hidden={{ id: String(v._id), version: String(v.version), status: v.status === "active" ? "archived" : "active" }}
                    fields={[]}
                    messages={messages}
                    submitLabel={v.status === "active" ? t("archiveVariant") : t("restoreVariant")}
                    pendingLabel={c("saving")}
                    variant="secondary"
                    layout="inline"
                  />
                  <p>
                    <Link className="prose-link" href={`/admin/inventory?q=${encodeURIComponent(v.sku)}`}>
                      {t("manageStock")}
                    </Link>
                  </p>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="staff-manage add-block" open={variants.length === 0}>
          <summary>{t("addVariant")}</summary>
          <ActionForm action={createVariantAction} testId="variant-create-form" layout="grid" hidden={{ productId: id }} messages={messages} submitLabel={t("addVariantSubmit")} pendingLabel={c("saving")} fields={variantFields(ct)} />
        </details>
      </section>

      <section className="admin-section" aria-labelledby="images-title">
        <h2 id="images-title" className="admin-section-title">
          {t("imagesTitle")}
        </h2>
        {product.media.length ? (
          <ul className="media-rows">
            {product.media.map((m) => (
              <li key={m.publicId} className="media-row">
                {cloud ? <AdminImage src={deliveryUrl(cloud.cloudName, m.publicId, 160)} alt={lt(m.alt, locale)} size={80} /> : null}
                <div>
                  <p>{lt(m.alt, locale)}</p>
                  <p className="field-hint">{t("rightsLine", { rights: m.rights })}</p>
                  <ActionForm action={removeProductMediaAction} hidden={{ ...hidden, publicId: m.publicId }} fields={[]} messages={messages} submitLabel={t("removeImage")} pendingLabel={c("saving")} variant="secondary" layout="inline" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-hint">{t("noImages")}</p>
        )}
        {cloud ? (
          <MediaUploader
            purpose="product"
            action={addProductMediaAction}
            hidden={hidden}
            messages={messages}
            testId="product-media-upload"
            fields={[
              ...localizedFields(ct, "alt", c("fields.alt"), undefined, { required: true, max: 200 }),
              { name: "rights", label: c("fields.rights"), hint: c("fields.rightsHint"), required: true, maxLength: 300, wide: true },
            ]}
            labels={{
              file: c("upload.file"),
              fileHint: c("upload.fileHint"),
              uploading: c("upload.uploading"),
              uploaded: c("upload.uploaded"),
              failed: c("upload.failed"),
              notConfigured: c("upload.notConfigured"),
              tooLarge: c("upload.tooLarge"),
              submit: c("upload.submit"),
              pending: c("saving"),
            }}
          />
        ) : (
          <p className="admin-notice" data-testid="media-not-configured">
            {c("upload.notConfigured")}
          </p>
        )}
      </section>

      {product.publishedAt ? null : (
        <section className="admin-section" aria-labelledby="delete-title">
          <h2 id="delete-title" className="admin-section-title">
            {t("deleteTitle")}
          </h2>
          <p className="field-hint">{t("deleteBody")}</p>
          <ActionForm
            action={deleteProductAction}
            testId="product-delete-form"
            hidden={hidden}
            messages={messages}
            submitLabel={t("delete")}
            pendingLabel={c("saving")}
            variant="danger"
            fields={[{ name: "confirm", label: t("deleteConfirm"), type: "checkbox", required: true }]}
          />
        </section>
      )}
    </div>
  );
}
