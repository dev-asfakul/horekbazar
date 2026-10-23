// B9 part 2 pure rules: VAPID configuration shape, the push sender's answers, the encrypted message
// (decrypted here per RFC 8291 with node:crypto, independent of the library), the VAPID signature
// (RFC 8292), and the e-mail log's masking and keyed hash.
import { createDecipheriv, createECDH, createHmac, createPublicKey, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pushConfig, PushRejectedError, sendPush, type PushConfig } from "@/lib/adapters/push/webpush";
import { emailHash, maskEmail } from "@/lib/modules/notifications/notifications";
import { zInternalPath } from "@/lib/modules/notifications/schema";

const b64u = (b: Buffer) => b.toString("base64url");

function vapidKeys(): PushConfig {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
  return { publicKey: b64u(pub), privateKey: jwk.d!, subject: "mailto:ops@example.test" };
}

function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, target: { endpoint: "https://push.example.test/send/abc123", keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } }, auth };
}

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/** RFC 8291 §3.4 + RFC 8188 decryption of a single-record aes128gcm body, as the browser does. */
function decrypt(body: Buffer, ecdh: ReturnType<typeof createECDH>, auth: Buffer) {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const asPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);
  const shared = ecdh.computeSecret(asPublic);
  const prkKey = hmac(auth, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  const end = plain.lastIndexOf(2); // padding delimiter of the last record
  return plain.subarray(0, end).toString("utf8");
}

function captureFetch(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const bodyBuffer = (body: unknown) => Buffer.from(body instanceof ArrayBuffer ? new Uint8Array(body) : (body as Uint8Array));

describe("push configuration (env, never logged)", () => {
  it("needs all three VAPID variables in the right shape", () => {
    const k = vapidKeys();
    const env = { NEXT_PUBLIC_VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: k.subject };
    expect(pushConfig(env)).toEqual(k);
    expect(pushConfig({})).toBeNull();
    expect(pushConfig({ ...env, VAPID_SUBJECT: "" })).toBeNull();
    expect(pushConfig({ ...env, VAPID_SUBJECT: "ops@example.test" })).toBeNull();
    expect(pushConfig({ ...env, VAPID_SUBJECT: "http://example.test" })).toBeNull();
    expect(pushConfig({ ...env, VAPID_PRIVATE_KEY: k.privateKey.slice(1) })).toBeNull();
    expect(pushConfig({ ...env, NEXT_PUBLIC_VAPID_PUBLIC_KEY: `${k.publicKey.slice(0, 86)}+` })).toBeNull();
    expect(pushConfig({ ...env, VAPID_SUBJECT: "https://shop.example.test" })?.subject).toBe("https://shop.example.test");
  });
});

describe("push sender", () => {
  it("encrypts the message so only the browser can read it (RFC 8291)", async () => {
    const k = vapidKeys();
    const b = browserKeys();
    const { calls, fetchImpl } = captureFetch(201);
    const data = { title: "অর্ডার কনফার্ম", body: "Order HB-1001 is confirmed.", url: "/account/orders/abc", tag: "order-abc" };
    await expect(sendPush(k, b.target, data, { fetchImpl })).resolves.toEqual({ outcome: "accepted", status: 201 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(b.target.endpoint);
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("ttl")).toBe("86400");
    expect(headers.get("urgency")).toBe("normal");
    expect(headers.get("topic")).toBe("order-abc");
    expect(JSON.parse(decrypt(bodyBuffer(calls[0]!.init.body), b.ecdh, b.auth))).toEqual(data);
  });

  it("signs a VAPID token for the push service's origin with the store's key (RFC 8292)", async () => {
    const k = vapidKeys();
    const { calls, fetchImpl } = captureFetch(201);
    await sendPush(k, browserKeys().target, { title: "t", body: "b", url: "/" }, { fetchImpl });
    const authz = new Headers(calls[0]!.init.headers).get("authorization") ?? "";
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(authz);
    expect(m).not.toBeNull();
    const [jwt, key] = [m![1]!, m![2]!];
    expect(key).toBe(k.publicKey);
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toMatchObject({ alg: "ES256" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims.aud).toBe("https://push.example.test");
    expect(claims.sub).toBe(k.subject);
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    expect(claims.exp).toBeLessThanOrEqual(Date.now() / 1000 + 24 * 3600);
    const raw = Buffer.from(k.publicKey, "base64url");
    const pub = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)) }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("reports a subscription that no longer exists and throws on other refusals", async () => {
    const k = vapidKeys();
    const t = browserKeys().target;
    const msg = { title: "t", body: "b", url: "/" };
    await expect(sendPush(k, t, msg, { fetchImpl: captureFetch(410).fetchImpl })).resolves.toEqual({ outcome: "gone", status: 410 });
    await expect(sendPush(k, t, msg, { fetchImpl: captureFetch(404).fetchImpl })).resolves.toEqual({ outcome: "gone", status: 404 });
    await expect(sendPush(k, t, msg, { fetchImpl: captureFetch(500).fetchImpl })).rejects.toBeInstanceOf(PushRejectedError);
    await expect(sendPush(k, t, msg, { fetchImpl: captureFetch(429).fetchImpl })).rejects.toThrow("push service answered 429");
  });

  it("refuses an endpoint that is not https", async () => {
    const b = browserKeys();
    await expect(sendPush(vapidKeys(), { ...b.target, endpoint: "http://push.example.test/x" }, { title: "t", body: "b", url: "/" }, { fetchImpl: captureFetch(201).fetchImpl })).rejects.toThrow();
  });
});

describe("campaign links", () => {
  it("accept only paths on this site", () => {
    const p = zInternalPath();
    for (const ok of ["/", "/c/rice", "/p/basmati-rice?x=1", "/en/c/oil"]) expect(p.safeParse(ok).success, ok).toBe(true);
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "c/rice", ""]) expect(p.safeParse(bad).success, bad).toBe(false);
  });
});

describe("e-mail log privacy", () => {
  it("masks the address and keys the hash with AUTH_SECRET", () => {
    expect(maskEmail("Rahim.Uddin@Example.com ")).toBe("r***@example.com");
    const env = { AUTH_SECRET: "x".repeat(32) };
    const h = emailHash("rahim@example.com", env);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(emailHash(" RAHIM@example.com", env)).toBe(h);
    expect(emailHash("rahim@example.com", { AUTH_SECRET: "y".repeat(32) })).not.toBe(h);
  });
});

describe("notification page gates", () => {
  it("the admin page needs campaigns.send; the e-mail log is shown only with customers.read", async () => {
    const { ADMIN_PAGE_CAPABILITY } = await import("@/lib/modules/identity/paths");
    const { sectionsFor } = await import("@/lib/admin/sections");
    expect(ADMIN_PAGE_CAPABILITY["/admin/notifications"]).toBe("campaigns.send");
    expect(sectionsFor(new Set(["campaigns.send"])).map((s) => s.key)).toContain("notifications");
    expect(sectionsFor(new Set(["orders.read"])).map((s) => s.key)).not.toContain("notifications");
  });
});

describe("worker runtime", () => {
  it("the outbox handlers load under Node's type stripping, as scripts/worker.ts runs them", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(process.execPath, ["--no-warnings", "--input-type=module", "-e", 'const m = await import("./lib/adapters/jobs/handlers.ts"); console.log(Object.keys(m.outboxHandlers).sort().join(","));'], { encoding: "utf8" });
    expect(out.trim().split(",")).toEqual(expect.arrayContaining(["email.send", "push.send"]));
  });
});

describe("push service hosts (SSRF guard)", () => {
  it("accepts the browsers' push services and refuses everything else", async () => {
    const { isPushServiceEndpoint } = await import("@/lib/modules/notifications/schema");
    for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/QH4", "https://api.push.apple.com/x", "https://wns2-par02p.notify.windows.com/w/?token=abc"]) expect(isPushServiceEndpoint(ok), ok).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com:444/x", "https://a:b@fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.test/x", "https://evilfcm.googleapis.com/x", "https://push.apple.com/x", "https://notify.windows.com/x", "https://127.0.0.1/x", "https://localhost/x", "not a url", ""]) expect(isPushServiceEndpoint(bad), bad).toBe(false);
  });

  it("sendPush never follows a redirect", async () => {
    const { sendPush } = await import("@/lib/adapters/push/webpush");
    const { generateKeyPairSync } = await import("node:crypto");
    const vapid = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
    const ua = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" });
    const pub = (j: typeof vapid) => Buffer.concat([Buffer.from([4]), Buffer.from(j.x!, "base64url"), Buffer.from(j.y!, "base64url")]).toString("base64url");
    let init: RequestInit | undefined;
    const fetchImpl = (async (_: string, i: RequestInit) => {
      init = i;
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    await sendPush({ publicKey: pub(vapid), privateKey: vapid.d!, subject: "mailto:ops@example.test" }, { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: pub(ua), auth: Buffer.alloc(16, 1).toString("base64url") } }, { title: "t", body: "b", url: "/" }, { fetchImpl });
    expect(init?.redirect).toBe("error");
  });
});
