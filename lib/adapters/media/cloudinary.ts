// Cloudinary signed uploads (B4 media; SCHEMA.md → media.sign route `/api/media/sign`).
// The browser uploads the file straight to Cloudinary with a short-lived signature from the server;
// the API secret never leaves the server. Signing follows Cloudinary's documented rules: every
// upload parameter except file, cloud_name, resource_type and api_key, sorted by name, joined with
// `&`, the secret appended, SHA-1 (https://cloudinary.com/documentation/authentication_signatures).
import { createHash } from "node:crypto";

export const MEDIA_PURPOSES = { product: "horekbazar/products", banner: "horekbazar/banners" } as const;
export type MediaPurpose = keyof typeof MEDIA_PURPOSES;
export const ALLOWED_FORMATS = "jpg,png,webp";
/** Cloudinary rejects a signature older than one hour; ours is used at once by the upload dialog. */
export const SIGNATURE_MAX_AGE_S = 3600;

export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const serialised = Object.keys(params)
    .filter((k) => !["file", "cloud_name", "resource_type", "api_key"].includes(k) && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(serialised + apiSecret).digest("hex");
}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function cloudinaryConfig(env: Record<string, string | undefined> = process.env): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

export function uploadSignature(config: CloudinaryConfig, purpose: MediaPurpose, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  const folder = MEDIA_PURPOSES[purpose];
  const params = { allowed_formats: ALLOWED_FORMATS, folder, timestamp };
  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    params,
    signature: signParams(params, config.apiSecret),
  };
}

/** A public id returned to the server must sit in the folder of its purpose (no foreign assets). */
export const isOwnPublicId = (publicId: string, purpose: MediaPurpose) =>
  publicId.startsWith(`${MEDIA_PURPOSES[purpose]}/`) && /^[A-Za-z0-9_\-/]+$/.test(publicId) && !publicId.includes("..");
