// Bearer check for job endpoints (SCHEMA.md: POST /api/jobs/drain requires CRON_SECRET).
// Constant-time comparison of SHA-256 digests, so neither the length nor the content of the secret leaks.
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function isAuthorizedBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match?.[1]) return false;
  return timingSafeEqual(digest(match[1]), digest(secret));
}
