// Cloudinary signing against the vendor's documented examples
// (https://cloudinary.com/documentation/authentication_signatures), the folder allow-list, and the
// admin-only CSP allowance for direct uploads.
import { describe, expect, it } from "vitest";
import { cloudinaryConfig, isOwnPublicId, signParams, uploadSignature } from "@/lib/adapters/media/cloudinary";
import { buildCsp } from "@/lib/security/headers";

describe("Cloudinary signatures", () => {
  it("matches the documented examples", () => {
    expect(signParams({ timestamp: 1315060510 }, "abcd")).toBe("a21ad0f63beb4de2e5575204b79ab90bffb02c10");
    expect(signParams({ timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" }, "abcd")).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("excludes file, cloud_name, resource_type and api_key from the signed string", () => {
    expect(signParams({ timestamp: 1315060510, api_key: "k", cloud_name: "c", resource_type: "image", file: "x" }, "abcd")).toBe("a21ad0f63beb4de2e5575204b79ab90bffb02c10");
  });

  it("signs the purpose folder and formats, and never returns the secret", () => {
    const signed = uploadSignature({ cloudName: "demo", apiKey: "123", apiSecret: "s3cr3t-value" }, "product", 1_700_000_000_000);
    expect(signed.params).toEqual({ allowed_formats: "jpg,png,webp", folder: "horekbazar/products", timestamp: 1_700_000_000 });
    expect(JSON.stringify(signed)).not.toContain("s3cr3t-value");
    expect(signed.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
  });

  it("is disabled unless all three variables are set", () => {
    expect(cloudinaryConfig({})).toBeNull();
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "a", CLOUDINARY_API_KEY: "b" })).toBeNull();
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "a", CLOUDINARY_API_KEY: "b", CLOUDINARY_API_SECRET: "c" })).not.toBeNull();
  });

  it("accepts only public ids inside the purpose folder", () => {
    expect(isOwnPublicId("horekbazar/products/abc_123", "product")).toBe(true);
    expect(isOwnPublicId("horekbazar/banners/abc", "product")).toBe(false);
    expect(isOwnPublicId("someone-else/abc", "product")).toBe(false);
    expect(isOwnPublicId("horekbazar/products/../x", "product")).toBe(false);
  });

  it("allows uploads to Cloudinary from admin pages only", () => {
    const connect = (p: string) => buildCsp("n", { pathname: p, isDev: false }).split("; ").find((d) => d.startsWith("connect-src"));
    expect(connect("/admin/products/new")).toBe("connect-src 'self' https://api.cloudinary.com");
    expect(connect("/")).toBe("connect-src 'self'");
    expect(connect("/checkout")).toBe("connect-src 'self'");
  });
});
