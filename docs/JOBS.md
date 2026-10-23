# Scheduled outbox drain (cron-job.org)

Owner decision 2026-10-23 (C-01): the outbox is drained by **cron-job.org** calling the existing HTTP
trigger. There is no Vercel Cron configuration (Hobby allows one run a day) and no QStash dependency.
`JOBS_TRIGGER=http`. This file holds no secret values.

> **Status: not operational until verified.** Nothing is scheduled until the owner has created the
> cron-job.org job and the smoke test below has passed against the deployment. Until then, mail and
> push rows that depend on the drain wait in the outbox (`/admin/health` → Outbox).

## What runs

| | |
|---|---|
| Endpoint | `POST https://<deployment host>/api/jobs/drain` (no query string: a call with one is refused with 400) |
| Header | `Authorization: Bearer <CRON_SECRET>` (exact form: `Bearer`, one space, the secret) |
| Body | none |
| Schedule | every minute (`* * * * *`), the cron-job.org maximum |
| Time zone | any (the drain does not depend on it) |
| Timeout | cron-job.org closes the connection after 30 s |

Each accepted call drains due rows for at most 20 s and at most 100 rows. Handlers have their own
provider timeouts (e-mail 10 s, push 10 s, courier 15 s), so a call that starts a slow provider request just before the 20 s budget
can outlast cron-job.org's 30 s timeout. That is safe (leases and the drain lock stay in force, the row is
retried) but cron-job.org records the call as failed.

## Responses (counts only; never payloads, addresses or credentials)

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ ok: true, claimed, done, retried, dead, durationMs }` | Drain ran. `done` counts only rows whose provider accepted the request; a claimed row is not a delivery |
| 200 | `{ ok: true, skipped: "locked" }` | Another drain holds the lock; nothing was processed |
| 200 | `{ ok: true, skipped: "interval" }` | A drain was accepted less than 30 s ago (replay damping); nothing was processed |
| 400 | `{ error: "unexpected_query" }` | The URL has a query string (the secret must never be put in the URL) |
| 401 | `{ error: "unauthorized" }` | Missing, malformed or wrong `Authorization` header |
| 409 | `{ error: "trigger_not_http" }` | `JOBS_TRIGGER` is not `http` |
| 503 | `{ error: "not_configured" }` | `CRON_SECRET` unset or shorter than 32 characters |
| 503 | `{ error: "database_<state>" }` | Database not ready |
| 500 | `{ ok: false, … }` or `{ error: "drain_failed" }` | The drain failed; the lock is released, rows keep their leases and are retried |

`GET` answers 405.

## Safety properties (tests: `tests/integration/drain-route.test.ts`, `tests/integration/outbox.test.ts`)

- **Secret:** compared as SHA-256 digests with `timingSafeEqual` (`lib/adapters/jobs/auth.ts`). Read only
  from the header; the route never logs it or stores it.
- **One drain at a time:** `acquireDrainSlot` (`lib/modules/platform/outbox.ts`) is one atomic
  `findOneAndUpdate` with upsert on the `jobs` row `outbox-drain` (unique `name`). It sets `lockUntil`
  (75 s, longer than the 60 s function limit, so a killed function's lock runs out) and `lockOwner`.
  The lock is released in `finally`.
- **Replay damping:** the same update only matches when `lastAcceptedAt` is at least 30 s old. Retries,
  duplicate deliveries and replayed requests inside the window are answered `skipped: "interval"`.
- **Unchanged:** row leases (60 s), idempotency keys, exponential backoff with jitter, dead letter after
  8 attempts, 100-row and 20 s caps, provider timeouts.
- **Recorded:** `jobs` row `outbox-drain`: `lastRunAt`, `lastResult` (counts), `lastSuccessAt`,
  `lastAcceptedAt`, `accepted`, `skippedLocked`, `skippedInterval`, `lastSkippedAt`, `lastSkipReason`.
  No personal data and no credentials. Shown on `/admin/health`.

## Owner setup (Vercel and cron-job.org; the agent has no access to either)

1. **Generate the secret** on your own machine: `openssl rand -base64 32` (44 characters). Do not paste
   it into chat, issues or commits.
2. **Vercel → project → Settings → Environment Variables** (each environment that should drain):
   `JOBS_TRIGGER` = `http`, `CRON_SECRET` = the new value. Redeploy so the functions read it.
3. **cron-job.org → Create cronjob:**
   - URL: `https://<deployment host>/api/jobs/drain` (HTTPS, no query string).
   - Schedule: every minute.
   - Advanced → Request method: `POST`. Headers: `Authorization` = `Bearer <CRON_SECRET>`.
   - Notifications: turn on "execution failed" and "job disabled" e-mails. cron-job.org disables a job
     after more than 25 failures in a row.
   - Save responses: optional; they hold counts only.
4. **Smoke test** (from your machine, the secret in an environment variable, not typed into the command):
   ```sh
   curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<deployment host>/api/jobs/drain
   ```
   Expect 200 with counts or `skipped`. Then check without the header: expect 401.
5. **Verify scheduling:** after a few minutes, cron-job.org's history shows 200 responses each minute and
   `/admin/health` → Jobs shows a recent last run, a growing "HTTP drains accepted" count and state
   "Configured" (not "Not working"). Only then record C-01 as operational (docs/STATUS.md).

Rotating `CRON_SECRET`: set the new value in Vercel and redeploy, then update the cron-job.org header
straight away. Calls in between answer 401 and are retried on the next minute.

## Sources

- cron-job.org FAQ (frequency, 30 s timeout, 64 KB response limit, custom headers and methods, automatic
  deactivation after 25 failures, failure e-mails): https://cron-job.org/en/faq/
- Vercel Cron on Hobby runs at most once a day: https://vercel.com/docs/cron-jobs/usage-and-pricing
