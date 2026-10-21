// Formal JSON Schema check of the draft catalogue package (catalogue/horekbazar/CATALOGUE-SCHEMA.md).
// A repository check only: application code never reads catalogue/ (D11, R14).
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

const dir = "catalogue/horekbazar";
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(`${dir}/schema.json`, "utf8")));
let bad = 0;
for (const f of ["categories.json", "products.json", "sources.json", "image-manifest.json"]) {
  const ok = validate(JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
  console.log(f, ok ? "valid" : "INVALID");
  if (!ok) {
    bad++;
    console.log(validate.errors?.slice(0, 5));
  }
}
process.exit(bad ? 1 : 0);
