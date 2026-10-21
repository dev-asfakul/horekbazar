// Session cookie names, kept free of the Better Auth import so the proxy stays light.
export const COOKIE_PREFIX = "hb";
export const SESSION_COOKIE = `${COOKIE_PREFIX}.session_token`;
export const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`;

/**
 * The session token from a Better Auth Set-Cookie response (value is `token.signature`, URL-encoded).
 * Needed where Better Auth rotates the session (2FA enrolment) but returns the previous token in its body.
 */
export function sessionTokenFromSetCookie(headers: Headers): string | null {
  for (const cookie of headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const eq = pair!.indexOf("=");
    const name = pair!.slice(0, eq).trim();
    if (name !== SESSION_COOKIE && name !== SECURE_SESSION_COOKIE) continue;
    const value = decodeURIComponent(pair!.slice(eq + 1));
    const dot = value.lastIndexOf(".");
    const token = dot > 0 ? value.slice(0, dot) : value;
    if (token) return token;
  }
  return null;
}
