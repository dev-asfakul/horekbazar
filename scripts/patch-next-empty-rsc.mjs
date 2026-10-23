// C-02 workaround for vercel/next.js#100398 (open; owner-approved 2026-10-23), applied on install
// (postinstall) and checked again before every build (prebuild).
//
// Bug: after a Server Action calls redirect(), Next fetches the target with an empty `_rsc=`. When the
// proxy rewrites the request (our "/x" -> "/bn/x"), Next's proxy adapter re-attaches `_rsc` only when
// it is truthy, so the empty value is dropped; the destination's cache-busting check then answers
// 307 -> "/bn/x?_rsc", proxy.ts answers the canonical 308 -> "/x", and the fetch loops until
// "redirect count exceeded". Fix (the one proposed upstream): forward a *present* `_rsc`, even if empty.
// An absent `_rsc` is still not added, so Next's cache-poisoning check is unchanged.
//
// Guard: applies only to the exact pinned Next version, and only if the exact original line is found
// once per file. Anything else stops the install/build with a message, so a Next upgrade cannot pass
// silently with the patch missing or misapplied.
//
// REMOVE THIS SCRIPT (and the postinstall/prebuild entries in package.json) when a Next release
// contains the fix for vercel/next.js#100398: i.e. its dist/server/web/adapter.js forwards `_rsc` when
// `rscHash !== null`. Then upgrade Next and confirm tests/e2e/rsc-rewrite.spec.ts still passes.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const PINNED = "16.4.2";
const ORIGINAL = "if (response && rewrite && isRSCRequest && rscHash) {";
const PATCHED = "if (response && rewrite && isRSCRequest && rscHash !== null) { /* horekbazar C-02: vercel/next.js#100398 */";
const FILES = ["dist/server/web/adapter.js", "dist/esm/server/web/adapter.js"];

const require = createRequire(import.meta.url);
const fail = (message) => {
  console.error(`patch-next-empty-rsc: ${message}`);
  process.exit(1);
};

// PATCH_NEXT_ROOT points the script at a fake package in tests/unit/patch-next.test.ts.
let root = process.env.PATCH_NEXT_ROOT;
if (!root) {
  try {
    root = dirname(require.resolve("next/package.json"));
  } catch {
    // next is not installed (e.g. a partial install); nothing to patch, and the build would fail anyway.
    process.exit(0);
  }
}
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (version !== PINNED) {
  fail(`next is ${version}, but this workaround was written for ${PINNED}. Check whether vercel/next.js#100398 is fixed in ${version}; then remove or update scripts/patch-next-empty-rsc.mjs.`);
}

let changed = 0;
for (const rel of FILES) {
  const file = join(root, rel);
  const source = readFileSync(file, "utf8");
  if (source.includes(PATCHED)) continue;
  const count = source.split(ORIGINAL).length - 1;
  if (count !== 1) fail(`expected the original line exactly once in next/${rel}, found ${count}; not patching.`);
  writeFileSync(file, source.replace(ORIGINAL, PATCHED));
  changed++;
}
console.log(`patch-next-empty-rsc: next ${version} ${changed ? `patched (${changed} file${changed > 1 ? "s" : ""})` : "already patched"}`);
