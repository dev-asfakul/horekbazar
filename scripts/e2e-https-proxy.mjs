// TEST-ONLY HTTPS front for the local production server (D17 condition: WebKit script-loading tests
// run over HTTPS because the production CSP sends upgrade-insecure-requests, which WebKit applies to
// http://127.0.0.1 subresources). It creates a throwaway self-signed certificate in a temp directory
// with openssl and forwards every request unchanged. Never used outside Playwright.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

const listenPort = Number(process.env.E2E_HTTPS_PORT ?? 3443);
const targetPort = Number(process.env.E2E_PORT ?? 3100);
const dir = mkdtempSync(join(tmpdir(), "hb-e2e-tls-"));
const keyPath = join(dir, "key.pem");
const certPath = join(dir, "cert.pem");
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost", "-keyout", keyPath, "-out", certPath], { stdio: "ignore" });
const key = readFileSync(keyPath);
const cert = readFileSync(certPath);
rmSync(dir, { recursive: true, force: true });

const server = https.createServer({ key, cert }, (req, res) => {
  const upstream = http.request({ host: "127.0.0.1", port: targetPort, method: req.method, path: req.url, headers: req.headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => {
    res.writeHead(502).end();
  });
  req.pipe(upstream);
});
server.listen(listenPort, "127.0.0.1", () => console.log(`test-only HTTPS proxy https://127.0.0.1:${listenPort} -> http://127.0.0.1:${targetPort}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
