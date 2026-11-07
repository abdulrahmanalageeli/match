# Mobile review follow-up — 7 November 2026

Scope: the Saudi member and guardian findings from the mobile review. No desktop UX audit, redesign of the questionnaire, production data changes, or deployment.

## Implemented

| Finding | Result |
| --- | --- |
| 1 | Family invitations use a configured valid HTTPS public URL. Native/local/invalid origins retain the usable short code without a broken link or QR. |
| 2 | Recommended discovery and full browsing apply the same active filters on the server. |
| 3 | Notification profiles offer the applicable request, pending request, or accepted chat action. Retry reconciliation prevents duplicate requests. |
| 4 | Help describes the actual version's call and attachment controls. Live voice retains recipient acceptance for each call; no nonexistent live attachment controls were added. |
| 5 | Discovery pause preserves accepted direct/family conversations and mutually accepted introductions. New discovery/requests stay gated; payment, blocks, suspension and session checks still apply. |
| 6 | Public edits are allowed once per rolling 30 days: text, public Beena stories, portrait replacements and gallery additions share the allowance. Initial submissions and pending corrections remain usable. Privacy reductions remain immediate. During review, accepted peers see approved text only; photos are hidden. Consent withdrawal also removes retained snapshot content immediately. |
| 7 | Family preparation retains separate drafts by type and across dialog close within the open conversation. Onboarding explains that saving answers does not save new photo choices; leaving with those choices requires an explicit confirmation. |
| 8 | Enter inserts a paragraph in family messages; sending requires the explicit send action. |
| 9 | Family read acknowledgments require the latest incoming message's end to be visible, with no open dialog. |
| 10 | Ready family relationships take precedence over pending links in guidance, with per-person status. |
| 11 | Authenticated members and guardians can create and follow in-app support requests, see a receipt/status, and read a staff reply. Owner/moderator staff have an MFA-protected queue. Requests are account-scoped, idempotent and rate-limited; no profile/chat is attached automatically. Email plus copy-address remains available. |
| 12 | A participant can leave a family room personally. Others retain access and history; the departing participant needs a newly consented room to rejoin. |
| 16 | Requests expose server-supplied expiry and neutral closed history. Historical aliases are frozen at closure; legacy rows without a snapshot use a neutral label. No closed profile/chat route or report reason is exposed. |
| 17 | Final-stage conversation guidance links directly to completion planning. |
| 18 | Readiness copy says self-reported information rather than proofs; report consequences describe an existing request/introduction conditionally. |

## Deliberately retained or deferred

- Findings 13–14 and the questionnaire ordering part of 17: questionnaire length, content, defaults, and sequence remain for later as requested.
- Finding 15: retained the paid membership offer after approval/availability. Early screens disclose recurring paid membership; Apple supplies the final price before purchase confirmation. Rich compatibility content and interest/visit awareness remain. No revenue increase is claimed without measurement.
- The SQLite prototype is an explicitly selected development-only fallback. The lifecycle changes target the supported Supabase backend and the fictional demo; that prototype was not expanded.

## Verification

- Member production build and TypeScript checks.
- Frontend full run: 250/251 passed initially; the single stale verification-copy expectation was corrected, and its 5-test component suite passed.
- Admin build; full existing 30-test run passed after stale maintenance RPC mocks were updated. Added support persistence/idempotency/revision coverage; the resulting 14-test adapter suite passed.
- Disposable PostgreSQL: 12 lifecycle tests, 31 matching tests across 11 files, 13 family tests, 2 support tests; the gallery tests passed again after the final allowance change. Additional photo, voice, consent and readiness regression groups passed. These groups overlap and are not summed.
- Browser checks with synthetic accounts: 320/390-pixel layouts; accepted chat sending while paused; family multiline composition, preparation switch/close/reopen and personal departure; support receipt, lost-response retry across close/reopen, staff reply and separate account history. Saved images are in `docs/qa/`.
- No physical iPhone, real Apple transaction, push-delivery or hosted deployment validation was performed. The local Supabase advisor had no running PostgreSQL service; SQL behavior and function/table permissions were checked in disposable PostgreSQL instead.

## Release requirements

Apply the new lifecycle, matching outcomes, support and personal-leave migrations together before releasing the matching client/admin builds. Set `VITE_MARRIAGE_FAMILY_PUBLIC_URL` to the verified HTTPS public app URL for the same backend to enable native invitation links/QR. Short-code invitations remain available without it.

The support queue must be monitored by authorized staff; no response time is promised. Support request content is stored privately and cascades with account deletion. Staff replies are intentionally visible to the requesting account; no automatic notifications or outbound email were added.
