# Creating the first Owner account

For the person who deploys HorekBazar. This uses the built-in first-Owner flow (D23). There is no
default account, no built-in password and no other way in. Never paste secret values into chat,
issues, commits or this file.

## What protects the setup

- `/admin/setup` only works while no Owner exists. One `installation` record with a fixed id is
  claimed when the Owner is created, so only one claim can ever succeed, even if two people submit at
  the same moment. After that, the page no longer shows the form, and a copy of the form left open
  in another tab is refused on the server (`setup_done`). The token stops working once setup is done;
  you can delete it afterwards.
- The token is read from the deployment's environment (`SETUP_TOKEN`, at least 16 characters) and
  compared in constant time. It is never shown in the page or the HTML.
- Attempts are rate-limited per IP address (5 per hour, Upstash). If Upstash is missing or down, the
  form refuses to run (fail-closed).
- The password (10–128 characters) is hashed by Better Auth; the plain text is never stored.
- The Owner must verify the email address before the first sign-in, then set up two-step
  verification (TOTP plus 10 backup codes) before any admin section opens.

## Environment variables needed for setup

Set them in the canonical Vercel project → Settings → Environment Variables, choosing the right
environment (Production / Preview / Development) for each. Then redeploy. Names only:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | the deployment's public `https://` address, no trailing slash |
| `MONGODB_URI`, `MONGODB_DB` | a separate database per environment. A name ending in `_dev` allows sample records to be published there; do not use `_dev` for anything the public should trust |
| `AUTH_SECRET` | `openssl rand -base64 32`; different per environment |
| `SETUP_TOKEN` | `openssl rand -base64 24`; keep it in a password manager; remove after setup |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | rate limits; sign-in, setup and password reset refuse to run without them |
| `RESEND_API_KEY`, `EMAIL_FROM` | `EMAIL_FROM` must be on a domain verified in Resend. With Resend's shared test sender `onboarding@resend.dev`, mail is delivered **only to the email address that owns the Resend account**, so the Owner email must be that address until a domain is verified |
| `JOBS_TRIGGER`, `CRON_SECRET` | retry of queued email (outbox drain) |

Other variables in `.env.example` (Cloudinary, VAPID, courier, Gemini, Ably) are not needed to
create the Owner.

## Steps

1. Set the variables above and redeploy.
2. Open `https://<site>/api/health`. Expect `"database":"connected"`. (`setupRequired` stays `true`
   until both the Owner and the store settings exist.)
3. Open `https://<site>/admin/setup`. If the page lists something as missing, fix that variable and
   redeploy.
4. Enter your name, the Owner email (see the Resend note above), a long passphrase from your password
   manager, and the setup token. Submit once.
5. Open the verification email (the link works for 24 hours) and confirm the address.
6. Sign in at `https://<site>/login`. You are taken to `/admin/security`: scan the QR code with an
   authenticator app, enter the code, and **store the 10 backup codes offline**.
7. Remove `SETUP_TOKEN` from the Vercel environment and redeploy. Optional, but it removes a secret
   that is no longer needed.
8. Fill in `/admin/settings` (store identity) and `/admin/settings/delivery` (real fees).

## Recovery

- Forgotten password: `https://<site>/forgot-password`. The reset link works once, for 1 hour. The
  page shows the same message whether or not the address has an account.
- Lost authenticator and backup codes on the last Owner: someone with the deployment's database
  credentials runs `npm run admin:recover-owner -- <owner email>`. This clears two-step verification
  and signs the Owner out everywhere (audited). There is no static recovery password.
- Never reset or replace an existing Owner without the Owner's explicit authorisation.

## Verification record

2026-10-22: run locally against the production build, a throwaway in-memory MongoDB, a throwaway
`AUTH_SECRET` and `SETUP_TOKEN`, real Upstash, and a non-working email key (so no mail could be
delivered). Result: wrong token refused with no user created; valid token created exactly one Owner
(`staffRoleKey: owner`, password hashed, audit entry, verification email recorded); the setup page
then hid the form; a form left open from before setup was refused on the server; sign-in refused
before verification; verification link worked; wrong password refused; correct password signed in;
the Owner without 2FA was sent to `/admin/security`; signed-out `/admin/products` redirected to
`/login`; a reset was queued for the Owner and not for an unknown address; after the reset the old
password failed and the new one worked; the reset link could not be used twice. Not run in a
browser: TOTP enrolment and step-up (covered by `tests/integration/identity.test.ts`).
