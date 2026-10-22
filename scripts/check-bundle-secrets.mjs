// Fails if a secret-shaped string, or the value of any server-only variable present in the
// build environment, appears in the client bundle (.next/static). Skill rule sec-07.
// CI builds once with harmless canary values in every server-only variable, then runs this.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
const SERVER_ONLY = [
  "MONGODB_URI", "AUTH_SECRET", "AUTH_GOOGLE_CLIENT_SECRET", "UPSTASH_REDIS_REST_TOKEN",
  "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "RESEND_API_KEY", "VAPID_PRIVATE_KEY",
  "GEMINI_API_KEY", "STEADFAST_API_KEY", "STEADFAST_SECRET_KEY", "PATHAO_CLIENT_SECRET",
  "PATHAO_PASSWORD", "COURIER_WEBHOOK_SECRET", "ABLY_API_KEY", "CRON_SECRET", "OWNER_PASSWORD",
];
const PATTERNS = [
  [/mongodb(\+srv)?:\/\/[^\s"'`]+@/, "MongoDB URI with credentials"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "PEM private key"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
  [/\bre_[A-Za-z0-9]{24,}/, "Resend API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

let scanned = 0;
const findings = [];
const canaries = SERVER_ONLY.map((n) => [n, process.env[n]]).filter(([, v]) => v && v.length >= 8);
for (const file of files(ROOT)) {
  const text = readFileSync(file, "utf8");
  scanned++;
  for (const [re, label] of PATTERNS) if (re.test(text)) findings.push(`${file}: ${label}`);
  for (const [name, value] of canaries) if (text.includes(value)) findings.push(`${file}: value of ${name}`);
}

if (scanned === 0) {
  console.error(`No files under ${ROOT}. Run "npm run build" first.`);
  process.exit(2);
}
console.log(`Scanned ${scanned} client files; ${canaries.length} server-only values checked.`);
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log("OK: no secret-shaped strings or server-only values in the client bundle.");
