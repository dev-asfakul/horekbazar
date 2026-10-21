// Starts the standalone production server (next.config.ts uses output: "standalone",
// which "next start" does not support). Copies the static assets and public/ into place first.
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (!existsSync(".next/standalone/server.js")) {
  console.error('No standalone build found. Run "npm run build" first.');
  process.exit(2);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });

const child = spawn(process.execPath, ["server.js"], { cwd: ".next/standalone", stdio: "inherit", env: process.env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
