// npm run db:validators            → writes db/validators/<collection>.json from the Zod schemas
// npm run db:validators -- --check → fails if the committed files differ from a fresh generation (CI)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collections } from "../lib/db/collections.ts";
import { generateValidatorFiles, VALIDATORS_DIR } from "../lib/db/validators.ts";

const check = process.argv.includes("--check");
const files = generateValidatorFiles();
const problems: string[] = [];

if (!existsSync(VALIDATORS_DIR)) mkdirSync(VALIDATORS_DIR, { recursive: true });
for (const [name, content] of files) {
  const path = join(VALIDATORS_DIR, name);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === content) continue;
  if (check) problems.push(`${path} ${current === null ? "is missing" : "differs from the generated validator"}`);
  else writeFileSync(path, content);
}
for (const name of readdirSync(VALIDATORS_DIR)) {
  if (name.endsWith(".json") && !files.has(name)) problems.push(`${join(VALIDATORS_DIR, name)} has no collection in lib/db/collections.ts`);
}

for (const spec of collections) {
  for (const rule of spec.serviceEnforced) console.log(`service-enforced  ${spec.name}: ${rule}`);
}
if (problems.length > 0) {
  for (const p of problems) console.error(p);
  if (check) console.error("Run `npm run db:validators` and commit the result.");
  process.exit(1);
}
console.log(`${check ? "OK: validators match" : "Wrote"} ${files.size} validators in ${VALIDATORS_DIR}/`);
