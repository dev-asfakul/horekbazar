#!/usr/bin/env node
// HorekBazar starter catalogue tool. Zero dependencies. Node >= 20.
// Usage:
//   node catalogue/horekbazar/tools/catalogue.mjs validate   # invariant checks (exit 1 on any error)
//   node catalogue/horekbazar/tools/catalogue.mjs report     # regenerate prices.csv and the price table in PRICE-RESEARCH.md
// This tool never connects to a database and never writes outside catalogue/horekbazar/.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const errors = [];
const warn = [];
const err = (m) => errors.push(m);

const FORBIDDEN_KEYS = new Set([
  'rating', 'ratings', 'averagerating', 'reviewcount', 'reviews', 'stars', 'sold', 'soldcount', 'salescount',
  'sales', 'popularity', 'popular', 'bestseller', 'isbestseller', 'trending', 'supplier', 'supplierid',
  'suppliername', 'certification', 'certifications', 'certified', 'badge', 'badges', 'countdown', 'urgency',
  'stockleft', 'viewers', 'testimonial', 'testimonials',
]);
// Claims that must not appear in generated customer-facing copy without evidence.
const BANNED_EN = [/\borganic\b/i, /\bcertified\b/i, /\bbsti[- ]approved\b/i, /\bhalal\b/i, /\bguarantee/i, /100\s?%/,
  /\bpure\b/i, /\bbest\b/i, /\bauthentic\b/i, /\bgenuine\b/i, /\boriginal\b/i, /\bpremium\b/i, /\bno\.?\s?1\b/i, /#1/,
  /\bcures?\b/i, /\bclinically\b/i, /\bdermatologist/i, /\blimited stock\b/i, /\bhurry\b/i, /\bfresh\b/i, /\bbpa[- ]free\b/i];
const BANNED_BN = ['অর্গানিক', 'সার্টিফাইড', 'হালাল', 'গ্যারান্টি', '১০০%', 'খাঁটি', 'সেরা', 'আসল', 'প্রিমিয়াম', 'নিখুঁত', 'তাজা', 'সীমিত স্টক'];
const BENGALI = /[\u0980-\u09FF]/;

function walkKeys(obj, path) {
  if (Array.isArray(obj)) return obj.forEach((v, i) => walkKeys(v, `${path}[${i}]`));
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) err(`${path}.${k}: forbidden field (fabricated social proof/supplier/certification)`);
      walkKeys(v, `${path}.${k}`);
    }
  }
}
function checkLT(lt, path, { customerFacing = false } = {}) {
  if (!lt || typeof lt.bn !== 'string' || typeof lt.en !== 'string' || !lt.bn.trim() || !lt.en.trim()) {
    return err(`${path}: bn and en text required`);
  }
  if (!BENGALI.test(lt.bn)) err(`${path}.bn: no Bengali script found`);
  if (customerFacing) {
    for (const re of BANNED_EN) if (re.test(lt.en)) err(`${path}.en: unsupported claim matched ${re}`);
    for (const w of BANNED_BN) if (lt.bn.includes(w)) err(`${path}.bn: unsupported claim "${w}"`);
  }
}
function checkMeta(meta, file) {
  if (!meta) return err(`${file}: meta missing`);
  if (meta.status !== 'draft_pending_owner_review') err(`${file}: meta.status must be draft_pending_owner_review`);
  if (meta.importAllowed !== false) err(`${file}: meta.importAllowed must be false`);
  if (meta.runtimeUse !== 'forbidden') err(`${file}: meta.runtimeUse must be forbidden`);
  if (meta.generated !== true) err(`${file}: meta.generated must be true`);
}
function checkSeo(seo, path) {
  for (const l of ['bn', 'en']) {
    const s = seo?.[l];
    if (!s?.title || !s?.description) { err(`${path}.${l}: SEO title/description required`); continue; }
    if ([...s.title].length > 60) err(`${path}.${l}.title > 60 chars`);
    if ([...s.description].length > 160) err(`${path}.${l}.description > 160 chars`);
  }
}

function validate() {
  const S = load('sources.json'); const C = load('categories.json'); const P = load('products.json'); const M = load('image-manifest.json');
  for (const [f, d] of [['sources.json', S], ['categories.json', C], ['products.json', P], ['image-manifest.json', M]]) {
    checkMeta(d.meta, f); walkKeys(d, f);
  }
  const sourceIds = new Set(S.sources.map((s) => s.id));
  if (sourceIds.size !== S.sources.length) err('sources: duplicate ids');
  // Categories
  const cats = new Map();
  for (const c of C.categories) {
    if (cats.has(c.id)) err(`category ${c.id}: duplicate id`);
    cats.set(c.id, c);
  }
  const catSlugs = new Set();
  for (const c of C.categories) {
    const p = `category ${c.id}`;
    if (catSlugs.has(c.slug)) err(`${p}: duplicate slug`); catSlugs.add(c.slug);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) err(`${p}: slug must be stable lowercase Latin`);
    if (c.parentId && !cats.has(c.parentId)) err(`${p}: parent ${c.parentId} not found`);
    if (c.parentId && cats.get(c.parentId)?.parentId) err(`${p}: max depth is 2`);
    if (c.status !== 'draft') err(`${p}: status must be draft`);
    if (c.review?.status !== 'pending_owner_review' || c.review.approvedBy !== null) err(`${p}: must be pending owner review`);
    checkLT(c.name, `${p}.name`, { customerFacing: true }); checkLT(c.description, `${p}.description`, { customerFacing: true });
    checkSeo(c.seo, `${p}.seo`);
  }
  const leaf = new Set([...cats.keys()].filter((id) => ![...cats.values()].some((c) => c.parentId === id)));
  // Products
  const ids = new Set(); const slugs = new Set(catSlugs); const skus = new Set();
  let refDerived = 0; let estimates = 0; const perTop = {};
  for (const pr of P.products) {
    const p = `product ${pr.id}`;
    if (ids.has(pr.id)) err(`${p}: duplicate id`); ids.add(pr.id);
    if (slugs.has(pr.slug)) err(`${p}: slug collides with another product or category`); slugs.add(pr.slug);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(pr.slug)) err(`${p}: invalid slug`);
    if (pr.status !== 'draft' || pr.generated !== true) err(`${p}: must be status draft and generated true`);
    if (pr.review?.status !== 'pending_owner_review' || pr.review.approvedBy !== null || pr.review.approvedAt !== null) err(`${p}: must be pending owner review`);
    if (!cats.has(pr.primaryCategoryId)) err(`${p}: primary category ${pr.primaryCategoryId} not found`);
    if (!leaf.has(pr.primaryCategoryId)) err(`${p}: primary category must be a leaf`);
    if (!pr.categoryIds?.includes(pr.primaryCategoryId)) err(`${p}: categoryIds must include primary`);
    for (const cid of pr.categoryIds ?? []) if (!cats.has(cid)) err(`${p}: category ${cid} not found`);
    const top = cats.get(pr.primaryCategoryId)?.parentId ?? pr.primaryCategoryId; perTop[top] = (perTop[top] ?? 0) + 1;
    if (pr.brand !== null || pr.brandStatus !== 'to_be_confirmed_by_owner') err(`${p}: brand must be null and to_be_confirmed_by_owner`);
    for (const k of ['name', 'shortDescription', 'description']) checkLT(pr[k], `${p}.${k}`, { customerFacing: true });
    checkSeo(pr.seo, `${p}.seo`);
    for (const a of pr.attributes ?? []) { checkLT(a.label, `${p}.attr.${a.key}.label`); checkLT(a.value, `${p}.attr.${a.key}.value`); if (a.verify !== true) err(`${p}.attr.${a.key}: verify must be true`); }
    if (!Array.isArray(pr.factChecks) || pr.factChecks.length === 0) err(`${p}: factChecks required`);
    if (pr.imageStatus !== 'missing') err(`${p}: imageStatus must be missing (no rights-verified images)`);
    for (const im of pr.images ?? []) {
      if (im.status !== 'missing' || im.assetId !== null || im.sourceUrl !== null || im.licence !== null) err(`${p}: image slot ${im.slot} must be missing with no source/licence`);
      checkLT(im.alt, `${p}.image.${im.slot}.alt`);
    }
    const rg = pr.regulatory;
    if (!rg || !['likely', 'unknown', 'not_found'].includes(rg.bstiMark) || rg.legalReviewRequired !== true) err(`${p}: regulatory block invalid`);
    for (const s of rg?.sourceIds ?? []) if (!sourceIds.has(s)) err(`${p}: regulatory source ${s} not found`);
    if (!pr.variants?.length) err(`${p}: at least one variant required`);
    const vcodes = new Set();
    for (const v of pr.variants ?? []) {
      const vp = `${p} ${v.sku}`;
      if (skus.has(v.sku)) err(`${vp}: duplicate SKU`); skus.add(v.sku);
      if (!/^HB-[A-Z]{3}-\d{3}-[A-Z0-9-]+$/.test(v.sku)) err(`${vp}: SKU format`);
      const [, code, num] = v.sku.split('-');
      if (`hb-${code.toLowerCase()}-${num}` !== pr.id) err(`${vp}: SKU does not match product id`);
      const oc = JSON.stringify(v.options); if (vcodes.has(oc)) err(`${vp}: duplicate option combination`); vcodes.add(oc);
      checkLT(v.title, `${vp}.title`);
      const inv = v.inventory;
      if (inv?.onHand !== 0 || inv.reserved !== 0 || inv.available !== 0 || inv.stockStatus !== 'unverified' || inv.availability !== 'unavailable') err(`${vp}: inventory must be zero/unverified/unavailable`);
      const pz = v.price;
      if (!Number.isInteger(pz?.proposed?.amountMinor) || pz.proposed.amountMinor <= 0) err(`${vp}: price amountMinor must be a positive integer (poisha)`);
      if (pz?.proposed?.currency !== 'BDT') err(`${vp}: currency must be BDT`);
      if (pz?.compareAt !== null) err(`${vp}: compareAt must be null (no invented reference prices)`);
      if (pz?.ownerReviewRequired !== true) err(`${vp}: ownerReviewRequired must be true`);
      if (pz?.status === 'reference_derived') {
        refDerived++;
        const r = pz.reference;
        if (!r || !sourceIds.has(r.sourceId)) err(`${vp}: reference source missing`);
        else if (S.sources.find((s) => s.id === r.sourceId).type !== 'official') err(`${vp}: reference_derived requires an official source`);
        if (r && Math.abs(r.derivedMaxBdt - r.maxBdt * r.multiplier) > 0.01) err(`${vp}: derived range inconsistent`);
        if (r && pz.proposed.amountMinor / 100 < r.derivedMinBdt) warn.push(`${vp}: proposed below reference range`);
      } else if (pz?.status === 'estimate_requires_owner_review') {
        estimates++;
        if (pz.reference !== null) err(`${vp}: estimate must not carry a reference`);
      } else err(`${vp}: unknown price status ${pz?.status}`);
      if (v.barcode !== null) err(`${vp}: barcode must be null until verified`);
      if (v.shippingWeightGrams?.status !== 'estimate') err(`${vp}: shipping weight must be marked estimate`);
    }
  }
  // Image manifest coverage
  const manIds = new Set(M.items.map((i) => i.productId));
  for (const id of ids) if (!manIds.has(id)) err(`image-manifest: ${id} missing`);
  for (const it of M.items) {
    if (!ids.has(it.productId)) err(`image-manifest: unknown product ${it.productId}`);
    for (const s of it.slots) if (s.status !== 'missing' || s.licence !== null || s.sourceUrl !== null) err(`image-manifest ${it.productId}.${s.slot}: must be missing`);
  }
  if (P.products.length < 100 || P.products.length > 150) warn.push(`product count ${P.products.length} outside 100-150 target`);
  const summary = { categories: C.categories.length, topLevel: [...cats.values()].filter((c) => !c.parentId).length, leaf: leaf.size,
    products: P.products.length, variants: skus.size, priceReferenceDerived: refDerived, priceEstimates: estimates,
    imagesMissing: P.products.length, productsPerTopCategory: perTop, warnings: warn.length, errors: errors.length };
  console.log(JSON.stringify(summary, null, 2));
  for (const w of warn) console.log('WARN', w);
  for (const e of errors) console.error('ERROR', e);
  if (errors.length) process.exit(1);
  console.log('OK: catalogue draft package passes all invariant checks');
}

function report() {
  const P = load('products.json');
  const rows = [['sku', 'product_en', 'product_bn', 'variant_en', 'price_status', 'proposed_bdt', 'ref_min_bdt', 'ref_max_bdt', 'ref_source', 'ref_observed_on', 'owner_review_required']];
  const md = ['| SKU | Product | Variant | Status | Proposed ৳ | Reference range ৳ | Basis |', '|---|---|---|---|---:|---|---|'];
  for (const pr of P.products) for (const v of pr.variants) {
    const r = v.price.reference; const bdt = v.price.proposed.amountMinor / 100;
    rows.push([v.sku, pr.name.en, pr.name.bn, v.title.en, v.price.status, bdt, r?.derivedMinBdt ?? '', r?.derivedMaxBdt ?? '', r?.sourceId ?? 'agent-estimate', r?.observedOn ?? '', 'true']);
    if (r) md.push(`| ${v.sku} | ${pr.name.en} | ${v.title.en} | reference_derived | ${bdt} | ${r.derivedMinBdt}–${r.derivedMaxBdt} | TCB ${r.sourceItem}, ${r.unitBasis} × ${r.multiplier} |`);
  }
  const csv = rows.map((r) => r.map((c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n') + '\n';
  writeFileSync(join(ROOT, 'prices.csv'), csv);
  const f = join(ROOT, 'PRICE-RESEARCH.md');
  const doc = readFileSync(f, 'utf8');
  const start = '<!-- price-table:start -->'; const end = '<!-- price-table:end -->';
  const i = doc.indexOf(start); const j = doc.indexOf(end);
  if (i < 0 || j < 0) throw new Error('PRICE-RESEARCH.md markers missing');
  writeFileSync(f, doc.slice(0, i + start.length) + '\n' + md.join('\n') + '\n' + doc.slice(j));
  console.log(`report: ${rows.length - 1} price rows written to prices.csv; ${md.length - 2} reference-derived rows in PRICE-RESEARCH.md`);
}

const cmd = process.argv[2];
if (cmd === 'validate') validate();
else if (cmd === 'report') report();
else { console.error('usage: catalogue.mjs <validate|report>'); process.exit(2); }
