// npm run showcase:images -- [--confirm] — uploads the reviewed showcase photos to Cloudinary and links
// them to their products in a "_dev" database.
//
// Source list: catalogue/horekbazar/showcase-images.json, one public-domain or CC0 photo per product
// (Openverse search, reviewed by eye on contact sheets). Every product here is a generic, unbranded item,
// so each photo is an illustration of the item type, not of a specific pack: the `rights` field starts
// with "Illustrative" and the product page says so (DESIGN.md decision trace, 2026-10-22).
//
// Idempotent: the Cloudinary public id is fixed per product (horekbazar/products/showcase-<slug>,
// overwrite=false), and a product that already has that image is skipped. The image is added through
// addProductMedia (version check, audit entry) with the Owner as the actor. Dry run by default.
import { closeDatabase, databaseConfig, getClient, getDatabase } from "../lib/adapters/db/client.ts";
import { cloudinaryConfig, MEDIA_PURPOSES, signParams } from "../lib/adapters/media/cloudinary.ts";
import { addProductMedia } from "../lib/modules/catalogue/products.ts";
import { PRODUCTS } from "../lib/modules/catalogue/schema.ts";
import { readFile } from "node:fs/promises";

interface SourceImage {
  slug: string;
  sourceUrl: string;
  title: string;
  creator?: string | null;
  license: "cc0" | "pdm";
  /** The licence as named on the source page (e.g. "CC0", "Public domain"). */
  licenseName?: string;
  landingUrl: string;
  provider: string;
}

const args = new Set(process.argv.slice(2));
if ([...args].some((a) => a !== "--confirm")) {
  console.error("Unknown option. Use --confirm to write.");
  process.exit(2);
}
const confirm = args.has("--confirm");
const LICENSE = { cc0: "CC0 1.0", pdm: "Public Domain Mark 1.0" } as const;

export function rightsFor(img: SourceImage): string {
  const by = img.creator ? ` by ${img.creator}` : "";
  return `Illustrative photo of the item type. ${img.licenseName ?? LICENSE[img.license]}: "${img.title}"${by}, via ${img.provider}, ${img.landingUrl}`.slice(0, 300);
}

/** Downloads the source politely (identified client, backoff on 429) and returns a data URI. */
async function download(url: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "HorekBazar-catalogue/1.0 (mail.horekbazar@gmail.com)" } });
    if (res.ok) {
      const type = res.headers.get("content-type") ?? "image/jpeg";
      if (!/^image\/(jpeg|png|webp)/.test(type)) throw new Error(`not an image (${type})`);
      return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`source answered ${res.status}`);
    await new Promise((r) => setTimeout(r, 15000 * (attempt + 1)));
  }
  throw new Error("source kept refusing (429)");
}

async function upload(cfg: NonNullable<ReturnType<typeof cloudinaryConfig>>, publicId: string, file: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { overwrite: "false", public_id: publicId, timestamp };
  const body = new FormData();
  body.set("file", file);
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  body.set("api_key", cfg.apiKey);
  body.set("signature", signParams(params, cfg.apiSecret));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/upload`, { method: "POST", body });
  const json = (await res.json()) as { public_id?: string; width?: number; height?: number; secure_url?: string; existing?: boolean; error?: { message: string } };
  if (!res.ok || !json.public_id) throw new Error(json.error?.message ?? `upload failed (${res.status})`);
  return json;
}

try {
  const cfg = cloudinaryConfig(process.env);
  if (!cfg) throw new Error("refused: Cloudinary is not configured (CLOUDINARY_* variables)");
  const db = await getDatabase();
  const client = getClient(databaseConfig(process.env)!);
  console.log(`database: ${db.databaseName}`);
  console.log(`mode:     ${confirm ? "WRITE (--confirm)" : "dry run (add --confirm to write)"}`);
  if (!db.databaseName.endsWith("_dev")) throw new Error("refused: only for a database whose name ends in _dev");
  const owner = await db.collection("user").findOne({ staffRoleKey: "owner" }, { projection: { _id: 1 } });
  if (!owner) throw new Error("refused: no Owner yet");
  const actor = { id: String(owner._id), role: "owner", ip: null };

  const list = JSON.parse(await readFile(new URL("../catalogue/horekbazar/showcase-images.json", import.meta.url), "utf8")) as { images: SourceImage[] };
  let added = 0;
  let present = 0;
  const failed: string[] = [];
  for (const img of list.images) {
    const publicId = `${MEDIA_PURPOSES.product}/showcase-${img.slug}`;
    const product = await db.collection(PRODUCTS).findOne({ slug: img.slug }, { projection: { _id: 1, version: 1, media: 1, name: 1 } });
    if (!product) {
      failed.push(`${img.slug}: no such product`);
      continue;
    }
    if ((product.media as { publicId: string }[]).some((m) => m.publicId === publicId)) {
      present++;
      continue;
    }
    if (!confirm) {
      added++;
      continue;
    }
    try {
      // Paced: the source sites throttle bursts of downloads.
      await new Promise((r) => setTimeout(r, 2000));
      const up = await upload(cfg, publicId, await download(img.sourceUrl));
      const name = product.name as { bn: string; en?: string };
      await addProductMedia(db, client, actor, String(product._id), product.version as number, {
        publicId: up.public_id!,
        alt: { bn: name.bn, ...(name.en ? { en: name.en } : {}) },
        rights: rightsFor(img),
        ...(up.width ? { width: up.width } : {}),
        ...(up.height ? { height: up.height } : {}),
      });
      added++;
    } catch (error) {
      failed.push(`${img.slug}: ${(error as { code?: string }).code ?? (error as Error).message}`);
    }
  }
  console.log(`images: ${list.images.length} in the list; ${confirm ? "uploaded and linked" : "would upload and link"} ${added}, already linked ${present}, failed ${failed.length}`);
  for (const f of failed) console.log(`  failed: ${f}`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
