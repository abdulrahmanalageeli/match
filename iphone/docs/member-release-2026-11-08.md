# Real member web release · 2026-11-08

Code release: `d58bca07`. Member deployment `dpl_2qBCPWFkvbRndpnatmcaTEwqjte7`
is promoted at https://nisfayn-preview.vercel.app/. Private pair entry remains
https://nisfayn-preview.vercel.app/?test=1.
Admin/worker deployment `dpl_8da9s14wj49HtPRx79KNnEbjKUj4` is promoted at
https://nisfayn-admin.vercel.app/.

Applied only to Nisfayn `wupkifqbwhhebwrgvwai`:

- `onboarding_account_drafts`: owner/session-checked RPC, private RLS table,
  seven-day expiry, export and existing daily cleanup integration.
- `web_push_delivery`: private session-bound browser subscriptions and queue.
- `member_signup_without_email_confirmation`: reserved-staff protection,
  live metadata check for staff identity and service-only signup rate limits.
- `member-signup` Edge Function v1: real password accounts without an email step;
  server-owned metadata explicitly records unverified email ownership.

Verification completed:

- Frontend/admin production builds, focused Auth/security/database, draft,
  Web Push/service worker and call lifecycle tests passed.
- Isolated 390px mobile form smoke passed autosave, reload, processing-purpose
  consent restoration, publication consent staying unchecked, logout/login
  resume, no sensitive browser storage, and no horizontal overflow/errors.
- One disposable unapproved real account completed signup, password sign-in,
  private draft save, logout, sign-in, resume, notification preference read and
  self-deletion. No profile was published; no emails/messages/calls were sent.
- Live browser confirmed the real signup screen and existing Reham test login.
  Abdulrahman's password field remains required on the private entry.
- Homepage, `/sw.js` and `/manifest.webmanifest` return HTTP 200 with correct types.
- Vercel Pro cron is enabled every minute; production logs show successful
  empty-queue pushes with no failures. No actual recipient push was sent.
- Member deployment error-log scan found no entries at release.

Remaining limits: no physical iPhone background/locked-screen delivery or
two-device audio acceptance was performed. Browser call suspension beyond the
server lease still ends the call safely; this is not native background calling.
Password reset email still needs SMTP/redirect verification. Compromised-password
protection remains a live Auth advisor warning; full Auth management configuration
was unavailable. Signup does not approve a member or grant paid/pilot access.

Deploy the member app from a source root containing `iphone/`, matching the
existing Vercel Root Directory. This release used a committed Nisfayn-only Git
archive to avoid including unrelated, uncommitted BlindMatch changes.
