// C-02: the guard around the vercel/next.js#100398 workaround (scripts/patch-next-empty-rsc.mjs).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ORIGINAL = "if (response && rewrite && isRSCRequest && rscHash) {";
const FILES = ["dist/server/web/adapter.js", "dist/esm/server/web/adapter.js"];

function fakeNext(version: string, body: string) {
  const root = mkdtempSync(join(tmpdir(), "fake-next-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "next", version }));
  for (const f of FILES) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    writeFileSync(join(root, f), `a();\n${body}\nb();\n`);
  }
  return root;
}

function run(root: string) {
  try {
    const out = execFileSync(process.execPath, ["scripts/patch-next-empty-rsc.mjs"], { env: { PATH: process.env.PATH ?? "", PATCH_NEXT_ROOT: root }, encoding: "utf8", stdio: "pipe" });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stderr: string };
    return { code: err.status, out: err.stderr };
  }
}

describe("patch-next-empty-rsc", () => {
  it("patches the pinned version once per file and is idempotent", () => {
    const root = fakeNext("16.4.2", ORIGINAL);
    expect(run(root)).toMatchObject({ code: 0, out: expect.stringContaining("patched (2 files)") });
    for (const f of FILES) expect(readFileSync(join(root, f), "utf8")).toContain("rscHash !== null) { /* horekbazar C-02: vercel/next.js#100398 */");
    expect(run(root)).toMatchObject({ code: 0, out: expect.stringContaining("already patched") });
  });

  it("stops on any other Next version (re-check the upstream issue, then update or remove)", () => {
    const r = run(fakeNext("16.4.3", ORIGINAL));
    expect(r.code).toBe(1);
    expect(r.out).toContain("vercel/next.js#100398");
  });

  it("stops if the original line is missing or appears more than once", () => {
    expect(run(fakeNext("16.4.2", "if (response && rewrite) {")).code).toBe(1);
    expect(run(fakeNext("16.4.2", `${ORIGINAL}\n${ORIGINAL}`)).code).toBe(1);
  });
});
