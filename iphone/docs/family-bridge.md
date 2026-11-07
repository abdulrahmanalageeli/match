# Family Bridge — جسر الأهل

Family Bridge is a separate family coordination space. It does not expose the couple's private thread, private photos, readiness passport, or compatibility answers.

## User flow

1. An adult creates a guardian account at `/?family=1` with a display name, username, password, and explicit consent. No matching profile or email delivery is needed. Save the recovery key shown during signup.
2. A member opens Settings → جسر الأهل, selects the relative's relationship, and generates a private connection code. The QR/link is an alternative way to enter the same invitation.
3. The guardian submits the code. The member reviews the guardian's name and accepts or rejects the link. Staff independently review the request in Admin → جسر الأهل. Both member acceptance and admin approval are required; neither substitutes for the other. A pending request does not reveal the member's profile or conversations.
4. Both matched members independently agree to involve family. Each proposed room has an immutable roster of 2–6 people. Both members approve that exact roster before relatives receive invitations; each invited relative then accepts.
5. Only accepted room participants can read and send messages. A member who manages a room but is not on its roster cannot read its messages. A room may include two relatives, a member and a relative, or a larger selected group.

Invitations are single-use and expire after 24 hours. Linking is a declaration of relationship, not proof of legal guardianship, age, or identity. The member retains their decisions.

## Authentication and privacy boundaries

- Supabase manages guardian password hashing, sessions, and authentication. A server-controlled internal login alias maps the username to Auth; it is not a personal email or evidence of email ownership. Trusted guardian metadata must be written by the server, never accepted from user metadata.
- Guardian registration removes only the unused, profileless matching draft created by the existing Auth trigger. Established members and staff cannot be converted or deleted through guardian actions.
- The signup/recovery Edge Function uses service-only RPCs for bounded registration and recovery attempts. Recovery keys are secret credentials, separate from member connection codes. Recovery rotates the key and invalidates old sessions.
- If the managed Auth password update has an uncertain outcome, the recovery claim stays locked rather than re-enabling a possibly used key. An operator must reconcile that exceptional request before another recovery or key rotation; do not blindly clear claims. Existing sessions are revoked when recovery starts and when it finishes.
- Family tables are private under RLS. Public operations derive the actor from a valid current Auth session; the existing protected pair-test adapter derives its actor from the pair session. Clients cannot supply the identity being authorized.
- Every room read/send checks the current match, mutual consent, roster, and family links. Revoking a current participant’s link, withdrawing bridge consent, blocking, or ending the match closes affected rooms. Personal room departure removes only that participant’s access and retains their messages for others; later unlinking or administrative revocation of that departed link does not close the remaining room. Relinking or rematching does not reopen old rooms.
- The admin queue exposes link metadata, not family messages or private couple content. Owners and reviewers with current staff authority and MFA can approve, reject, or revoke a link with a reason. Decisions require a current revision and an idempotency key and enter the admin audit log. Administrative approval does not assert legal guardianship or identity verification. Revoking approval closes affected rooms permanently.
- Closed rooms become inaccessible immediately and are purged with their messages by the existing maintenance worker after 30 days. Export includes only currently accessible messages. Previously saved copies cannot be recalled.
- Family chat currently supports text, timestamps, unread counts, paginated history, and idempotent send retries. It does not claim end-to-end encryption or screenshot prevention.

## Deployment scope

The only database target is Nisfayn `wupkifqbwhhebwrgvwai`. Never apply this migration to the original BlindMatch project. Apply the Family Bridge migration before deploying the `guardian-access` and updated `pair-test` Edge Functions, then publish the web bundle. Existing member/admin email settings stay separate from username-based guardian access.

Initial signup abuse limits are 3 attempts per username, 8 per network digest, and 50 globally per hour. Connection-code claims are limited to 10 attempts per guardian per 15 minutes, including incorrect guesses. These are intentional initial-release limits; review before a larger launch. Network addresses are secret-scoped hashes; rate-window rows are removed after two days.

`tests/fixtures/family-bridge-qa.html` is an explicit local synthetic UI fixture; it has no real accounts or permission grants. Database authorization tests use disposable local databases.

## Release verification — 2026-11-07

- Migration `family_bridge` applied to Nisfayn; 11 Family Bridge tables have RLS enabled. Anonymous callers cannot execute the family API and ordinary authenticated users cannot provision credentials.
- `guardian-access` version 1 and `pair-test` version 12 are active. Deno type checking passed.
- Web deployment `dpl_5FhVPurEmc7bVSuKVGG34RB3URYq` is Ready at https://nisfayn-preview.vercel.app. Guardian entry: https://nisfayn-preview.vercel.app/?family=1.
- Nine SQL test groups, fourteen client/Edge/invite tests, six focused UI tests, TypeScript, and the production-mode build passed.
- Live disposable-account checks passed: signup, password login, family-only state, denial of member data, recovery-key rotation, denial of old sessions and key replay, and deletion of the disposable account. No family links or real rooms were created by that check; no test guardian accounts remained afterward.
- Local mobile UI checks covered code entry, pending link approval, acceptance, both partners' consent, exact-roster approval, guardian acceptance, and sending a fictional family message. The signup form was visually checked without submitting real credentials in the browser.

## Manual approval release — 2026-11-07

- `family_link_admin_review` applied. New links default to administrative review pending. Member consent remains independent, and only links with both approvals enter the room participant picker or pass server-side room eligibility checks.
- Owners and reviewers use Admin → جسر الأهل to search/filter requests and approve, reject, or revoke with a reason. Every decision is audited; account consent changes invalidate stale review forms. The panel does not expose conversation messages, portraits, recovery credentials, or invitation codes.
- Eleven family database test groups, sixteen client/UI tests, five admin adapter/privacy tests, and both builds passed. The live admin listing and review endpoints reject anonymous requests with HTTP 401.
- Local admin demo verified approval while member consent remained pending, the approved filter, the revocation control, and the named/reasoned audit entry.
- Admin deployment `dpl_FbNZUjocCzBMj2RgFwh5vcmJvZMn` and app deployment `dpl_8rfBAaEMGvExDqoHy1DKbG6X8iHN` are Ready at https://nisfayn-admin.vercel.app and https://nisfayn-preview.vercel.app respectively.

## Mobile audit fixes — local source, not deployed

- Configure `VITE_MARRIAGE_FAMILY_PUBLIC_URL` with the verified public HTTPS origin serving the same marriage backend before packaging native invitation links. No domain is guessed. HTTPS web builds can use their current public origin. Native/opaque/HTTP/local/credential-bearing/invalid bases omit QR and link controls while preserving the short connection code. Invitation secrets remain in the URL fragment.
- Preparation text stays in memory separately for introduction and next-step forms when switching type or closing the dialog. It is cleared on leaving the chat, loss of access, or app reload; no private draft is persisted to device/cloud. Returning requires fresh sharing confirmation. Preparing never sends; the composer has an explicit Send button, and Enter inserts a newline.
- Family read acknowledgments happen only after rendering the newest incoming message with its end visible in the chat and mobile viewport. Hidden pages and open dialogs suppress acknowledgments; polling alone does not mark off-screen messages read.
- Each link gives its own next action. A pending second relative does not hide a named ready relationship.
- Migration `20261107103456_family_room_personal_leave.sql` adds permanent `left_at` to the immutable approved roster. `leave_room` requires a currently accepted participant and a valid authenticated entrypoint. It stops their read/send/export access, retains messages for remaining participants, and never grants access again through relinking or acceptance retries. A new room requires all existing approval gates. A member who leaves can still withdraw overall bridge consent; leaving alone does not withdraw it. Leaving the last participant closes the now-empty room. `close_room` remains a separate all-participant action.
- Guardian support uses the isolated guardian auth client and expected user through the shared support provider. The support service requires its separate migration; there is no automatic submission or chat attachment.

Verification is local only: disposable SQL tests cover withdrawal, remaining history, later review revocation/unlink/relink, fresh-room approval, member consent withdrawal, expired sessions, direct helper permissions, and non-roster/pending denial. Synthetic mobile UI fixture never calls live accounts. Physical iPhone sharing and deployment configuration still require release validation; no cloud migration or deployment was performed for these changes.
