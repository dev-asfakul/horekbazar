// /admin/products (B4, BUILD-PLAN §1: catalogue.write). Search by name, slug or SKU; filter by
// status, category and sample flag; 25 per page. Cards below 1024 px, a table from 1024 px
// (DESIGN.md → Admin). Products without a photo show the LabelTile, never a stand-in image.
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LabelTile } from "@/components/commerce/LabelTile";
import { AdminImage, Pager, SampleBadge, StatusChip } from "@/components/admin/RecordBits";
import { adminPage, count, lt, money, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { cloudinaryConfig, deliveryUrl } from "@/lib/adapters/media/cloudinary";
import { listCategories } from "@/lib/modules/catalogue/categories";
import { listProducts } from "@/lib/modules/catalogue/products";
import { CATALOGUE_STATUSES, type CatalogueStatus } from "@/lib/modules/catalogue/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.products" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProductsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { locale, db } = await adminPage("/admin/products");
  const t = await getTranslations({ locale, namespace: "admin.products" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const q = searchParam(sp.q).slice(0, 80);
  const statusParam = searchParam(sp.status);
  const status = (CATALOGUE_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as CatalogueStatus) : undefined;
  const categoryId = /^[a-f0-9]{24}$/.test(searchParam(sp.category)) ? searchParam(sp.category) : undefined;
  const sampleParam = searchParam(sp.sample);
  const sample = sampleParam === "yes" ? true : sampleParam === "no" ? false : undefined;
  const page = Math.max(1, Math.min(10000, Number.parseInt(searchParam(sp.page) || "1", 10) || 1));

  const [list, categories] = await Promise.all([listProducts(db, { q, status, categoryId, sample, page, pageSize: 25 }), listCategories(db)]);
  const categoryName = new Map(categories.map((cat) => [String(cat._id), lt(cat.name, locale)]));
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const cloud = cloudinaryConfig();
  const filtered = Boolean(q || status || categoryId || sample !== undefined);
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (categoryId) params.set("category", categoryId);
    if (sampleParam) params.set("sample", sampleParam);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/admin/products${s ? `?${s}` : ""}`;
  };

  const thumb = (p: (typeof list.items)[number]["product"]) => {
    const first = p.media[0];
    if (first && cloud) return <AdminImage className="record-thumb" src={deliveryUrl(cloud.cloudName, first.publicId, 96)} alt={lt(first.alt, locale)} size={48} />;
    return (
      <span className="record-thumb">
        <LabelTile size="row" categoryName={categoryName.get(String(p.primaryCategoryId)) ?? ""} />
      </span>
    );
  };

  return (
    <div className="admin-page" data-testid="admin-products">
      <div className="admin-page-head">
        <div>
          <h1 className="font-display admin-title">{t("title")}</h1>
          <p className="admin-meta">{t("total", { count: count(list.total) })}</p>
        </div>
        <Link className="btn btn-primary" href="/admin/products/new" data-testid="product-new-link">
          {t("new")}
        </Link>
      </div>
      {sp.deleted ? (
        <p role="status" className="form-success admin-flash">
          {t("deleted")}
        </p>
      ) : null}

      <form className="admin-filters" role="search" action="/admin/products" method="get" aria-label={t("filters")}>
        <div className="field">
          <label className="field-label" htmlFor="pq">
            {t("search")}
          </label>
          <input id="pq" name="q" className="field-input" defaultValue={q} maxLength={80} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pstatus">
            {c("status")}
          </label>
          <select id="pstatus" name="status" className="field-input" defaultValue={status ?? ""}>
            <option value="">{c("any")}</option>
            {CATALOGUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {c(`statuses.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pcat">
            {c("category")}
          </label>
          <select id="pcat" name="category" className="field-input" defaultValue={categoryId ?? ""}>
            <option value="">{c("any")}</option>
            {categories.map((cat) => (
              <option key={String(cat._id)} value={String(cat._id)}>
                {lt(cat.name, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="psample">
            {c("sampleFilter")}
          </label>
          <select id="psample" name="sample" className="field-input" defaultValue={sampleParam}>
            <option value="">{c("any")}</option>
            <option value="yes">{c("sampleOnly")}</option>
            <option value="no">{c("realOnly")}</option>
          </select>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-secondary">
            {t("apply")}
          </button>
          {filtered ? (
            <Link className="prose-link" href="/admin/products">
              {t("clear")}
            </Link>
          ) : null}
        </div>
      </form>

      {list.items.length === 0 ? (
        <div className="admin-empty" data-testid="products-empty">
          <p className="admin-empty-title">{filtered ? t("emptyFiltered") : t("empty")}</p>
          <p className="field-hint">{filtered ? t("emptyFilteredHint") : t("emptyHint")}</p>
        </div>
      ) : (
        <>
          <table className="record-table" data-testid="products-table">
            <caption className="sr-only">{t("tableCaption")}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">{t("image")}</span>
                </th>
                <th scope="col">{t("name")}</th>
                <th scope="col">{c("category")}</th>
                <th scope="col">{c("status")}</th>
                <th scope="col" className="num">
                  {t("variants")}
                </th>
                <th scope="col" className="num">
                  {t("fromPrice")}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.items.map(({ product: p, variants, minPrice }) => (
                <tr key={String(p._id)} data-slug={p.slug}>
                  <td>{thumb(p)}</td>
                  <td>
                    <Link className="record-link" href={`/admin/products/${String(p._id)}`}>
                      {lt(p.name, locale)}
                    </Link>
                    {p.sample ? <SampleBadge label={c("sample")} title={c("sampleTitle")} /> : null}
                    <span className="record-sub" lang="en">
                      {p.slug}
                    </span>
                  </td>
                  <td>{categoryName.get(String(p.primaryCategoryId))}</td>
                  <td>
                    <StatusChip tone={p.status} label={c(`statuses.${p.status}`)} />
                  </td>
                  <td className="num">{count(variants)}</td>
                  <td className="num">{minPrice === null ? "—" : money(minPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="record-cards" data-testid="products-cards">
            {list.items.map(({ product: p, variants, minPrice }) => (
              <li key={String(p._id)} className="record-card">
                {thumb(p)}
                <div className="record-card-body">
                  <Link className="record-link" href={`/admin/products/${String(p._id)}`}>
                    {lt(p.name, locale)}
                  </Link>
                  <p className="record-sub">
                    {categoryName.get(String(p.primaryCategoryId))} · {t("variantCount", { count: count(variants) })}
                    {minPrice === null ? null : <> · {money(minPrice)}</>}
                  </p>
                  <p className="record-chips">
                    <StatusChip tone={p.status} label={c(`statuses.${p.status}`)} />
                    {p.sample ? <SampleBadge label={c("sample")} title={c("sampleTitle")} /> : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Pager page={page} pages={pages} hrefFor={hrefFor} labels={{ prev: c("prev"), next: c("next"), nav: c("pages"), status: c("pageOf", { page: count(page), pages: count(pages) }) }} />
        </>
      )}
    </div>
  );
}
