# Manual member verification

## Document submissions paused — 7 November 2026

New document collection is temporarily unavailable while an approved verification method and authority to collect any official-document copies are established. Consent alone is not treated as authority under PDPL Article 28. All categories are paused, including identity, marital status, education, employment and course evidence; no client flag can enable uploads.

The member screen shows previous requests and withdrawal controls only. The client rejects submission before any network request; the Edge function rejects prepare/upload/submit (upload before reading bytes); migration `20261107093757_restrict_manual_verification_uploads.sql` rejects the same RPC commands and blocks new/replacement Storage writes, including legacy service-role uploads. Existing history, scoped manual badges, authorized review/evidence access, withdrawal and deletion remain unchanged. No existing user records or documents are deleted by this migration.

The database regression creates historical requests before the restriction, applies it, and verifies closed member/tester/legacy upload paths together with preserved review and withdrawal/cleanup. Restore document collection only through a reviewed server/database change once the permitted verification method is established. Earlier upload acceptance notes below describe the implementation before this restriction.

Members open **Settings → توثيق بياناتي**. The flow supports marital status, identity documents, education, employment, and marriage-preparation courses. A separate, unchecked `manual-verification-v1` consent is required for each submission. JPEG, PNG, and PDF files are limited to 5 MiB and validated on the server.

Only owner/reviewer staff with a live session and MFA can open the administrative queue and make decisions. Review requires an explicit confirmation, a reason, and an expiry. Marital-status reviews expire within 90 days; other categories within 365 days. Staff cannot approve their own account. Decisions use revision checks and idempotency identifiers and enter the existing immutable staff audit.

Badges are server-issued, scoped manual-review claims. They appear in discovery, profiles, inbox, and chat headers. Profile badges open the exact scope and dates. They do not imply government verification, compatibility, or a guarantee of conduct. A changed relevant profile field permanently invalidates the existing review. Test-account provenance must remain test-only even if a dummy flag is later cleared.

## Documents and retention

Evidence uses the private `nisfayn-verification-evidence` bucket. Clients cannot access the bucket directly. The `manual-verification` Edge Function checks the caller through SQL before accessing Storage and checks authorization again before returning evidence. Files are never added to public cards or AI requests. Admin previews use local Blob URLs that expire after two minutes.

Withdrawal immediately denies access and attempts deletion; the daily administrative maintenance worker retries failed deletion. Drafts expire after one day, pending evidence after 90 days, and reviewed evidence after at most 30 days. Storage deletion is acknowledged only after the object is absent. Account deletion queues cascading evidence for deletion. Decision metadata is retained without the document; the privacy notice describes this distinction.

## Interfaces

- `POST /functions/v1/manual-verification`: `list`/`state`, `prepare`, `submit`, `withdraw`, and `evidence`. Real sessions use a bearer JWT; named testers use their existing session token.
- `POST /functions/v1/manual-verification?action=upload`: binary content with `x-request-id` and the caller's existing authentication.
- Admin RPCs: `marriage_admin_verifications`, `marriage_admin_verification_review`.
- Public claims: `manualVerifications` on member cards and named-pair state. No document path, review note, or evidence payload appears in these claims.

## Validation

- Member model/render tests: `node --experimental-strip-types --test src/verification/*.test.mjs`.
- Client orchestration: `node --experimental-strip-types --test tests/manual-verification-client.test.mjs`.
- Database and media isolation: `node --test supabase/tests/manual-verification.test.mjs supabase/tests/verification-media.test.mjs` (use the repository's Supabase test dependencies).
- Admin lifecycle: `npm test` in `admin/`.
- Opt-in live tester smoke: `node scripts/verify-manual-verification-live.mjs`. It creates only synthetic evidence, never approves it, withdraws it, and logs out its own test session.

This flow is manual document review. There is no government/provider verification integration or AI document adjudication.

## Release verification — 7 November 2026

Both migrations were applied to the dedicated Nisfayn project `wupkifqbwhhebwrgvwai`. The manual-verification and pair-test Edge Functions, member preview, and admin application were deployed.

- 211 application regression tests passed; an additional targeted run covering verification model/render/client and signup consent passed 17 tests (overlaps the regression run).
- 30 admin tests and both production builds passed. Six database/media security tests and the Edge Deno type check passed.
- Live tester smoke passed private upload, pending without badge, owner-only evidence access, public access denial, and withdrawal. SQL confirmed the test evidence was physically absent from Storage and marked deleted.
- Browser review exercised the deployed member form at 390px, loaded its real withdrawn request, and approved a marital-status fixture in the isolated admin demo. The real staff MFA review was tested in the database harness, not by signing into a staff account in the browser.
- Public badge rendering and expiry were tested with fixtures; no real member was granted verification during QA.
- Contrast for the new normal text is at least 4.5:1. The Arabic file control retains native keyboard access without duplicate English browser chrome.

Supabase advisors reported intentional deny-all RLS information for the private RPC-only tables and the pre-existing [leaked-password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The admin production-dependency audit found zero vulnerabilities; its nine tooling advisories are limited to development-only `@vercel/node` dependencies. No unrelated authentication or dependency settings were changed.
