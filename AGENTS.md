# Instructions for agents and developers

Read this first, then `docs/PROGRESS.md`, then `DESIGN.md`.

## Owner working rules (2026-10-21)

1. **Push after every phase and every change.** Any update to planning or code, approved or not yet approved, is committed and pushed to `dev-asfakul/horekbazar` (`main` for docs; feature/preview branches for unapproved code previews, per the Motomation skill).
2. **Write a summary every phase** in `docs/PROGRESS.md`: what was done, what was decided, what is open, what the next step is. Newest entry on top.
3. **Give the owner all changed `.md` files as one copyable block** in the chat reply.
4. Mark anything not yet approved as **proposed**; never present it as decided.

## Repositories

- App (this repo): `dev-asfakul/horekbazar`, private.
- Design skill: `asfakulsiam/asfakulsiam-motomation-design`, public, owned by `asfakulsiam`. **Never modify it from this project.** The connected account has read-only access to it.

## Workflow

- Design and build follow the Motomation Design skill v3.0.2: `npx skills add asfakulsiam/asfakulsiam-motomation-design` (installed into `.agents/`, ignored by git).
- Six checkpoints: 1 Stack · 2 Product contract · 3 Research and direction · 4 Build plan · 5 Design review · 6 Gate and ship. Stop at each and wait for the owner's explicit answer.
- Record every decision in `DESIGN.md` → Decision trace. Never re-ask an answered question.

## Hard rules

- No mock or fabricated data, no simulated success. Real configured services only; clear setup-required states otherwise.
- Never commit secrets, `.env` files, or customer data. `.env.example` has placeholders only.
- Separate dev, staging and production credentials.
- Do not claim a test, push, deploy or load target passed without verifying it.
