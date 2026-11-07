# Private pair website testing

The `demo` build opens a tester picker. Abdulrahman requires the server-validated password; Reham enters directly without a password, as requested for this shared test. The two roles start matched. Initial biographical answers are explicitly labeled editable examples, not verified facts about either person.

- Abdulrahman keeps the men/women discovery selector and can reopen the shared introduction.
- Reham sees two fictional men with generated, faceless Saudi portraits.
- The shared conversation, read receipts, mutual introduction steps and saved profiles persist in the isolated `nisfayn_test` schema of the Nisfayn project (`wupkifqbwhhebwrgvwai`).
- Foreground voice calls use the existing real Agora transport, with short-lived server-signed tokens and mutual acceptance. Both browsers need microphone permission and should stay open during testing.
- Photo messages and voice notes now upload to the private `nisfayn-test-chat` bucket through the authenticated tester endpoint. Photos are resized and stripped of metadata, recordings are capped at 60 seconds, and downloads use 120-second signed links. Files have an 8 MB limit and previews require explicit send.
- Sent means saved by the server, delivered means acknowledged by the peer browser, and read means displayed at the visible end of the conversation without an open dialog.
- Either tester may invite the other to allow calls. Only the recipient can accept; acceptance persists for future calls, while each actual call still requires answering. The backend enforces this before ringing or issuing audio credentials.
- Before any communication, Reham proposes a duration and signs the seriousness agreement. Abdulrahman signs and accepts the exact proposal. The deadline starts at acceptance. At expiry, communication pauses until both confirm moving to the family stage, or either ends the match. No family members are contacted by the app. Ending the match is visible below the chat header; the name/avatar opens the full partner profile.
- Billing, the separate private-photo album, and interactions with fictional discovery members retain the existing local demo behavior. This is a tester environment, not two production member accounts.

The `pair-test` Edge Function validates `NISFAYN_TEST_PASSWORD`, stored only as a Supabase secret. Sessions use random 256-bit tokens in sessionStorage, hashed server-side, expire after 24 hours, and are revoked on logout. Never put the password, session tokens or Agora certificate into frontend configuration. The SQL function is executable only by service_role; its custom session validation gates all shared actions. No BlindMatch data is accessed or changed.

Deployment: existing Vercel `nisfayn-preview`, with `npm run build:demo`. Native/production member builds retain the existing login flow.

Validation: TypeScript and demo build; isolated SQL tests in `supabase/tests/pair-test.test.mjs`; two independent browser sessions exchanging messages, persisting across reload, and establishing a real two-party Agora call.


November 6 — activity and exclusive commitment:
- The requests tab is now Notifications, retaining request controls and adding actual profile visits, commitment confirmations, and actionable journey proposals. Visits are grouped per visitor/recipient/UTC day. Only the recipient can mark a notification read.
- In-app message and journey banners open the relevant conversation. The chat shows a persistent journey summary. Browser-closed/lock-screen web push is not implemented; the existing native APNs setup is separate.
- Serious marriage discussions require each party to explicitly acknowledge that mutual consent closes other connections. Existing stage approvals do not imply that new consent. A commitment badge appears beside names once both approve.
- Production exclusivity is enforced by private SQL tables, mutual consent, competing-request guards, and compatibility filtering. Other requests and introductions close without deleting message history. Closing the exclusive connection releases exclusivity; previously closed connections do not reopen.
- The test pair uses server-persisted consent and exclusivity. Fictional conversations retire locally when the shared flag activates. Production member data and BlindMatch remain separate.
- Focused verification: commitment-notifications.test.mjs (disposable PostgreSQL) and activity-alerts.test.cjs (mocked mobile browser). No real pair agreement or messages are reset by these tests.


UI refinement: Notifications now renders a single chronological feed (visits, requests, unread messages, mutual introductions, journey and exclusivity), with category/unread filters and recorded event times. Unknown legacy dates remain explicitly undated. The redundant floating bell has been removed; foreground banners remain. Chat keeps one compact plan/deadline/end rail, with report/block/private albums in the options sheet and agreement details in a dialog. Discovery and public profiles use a quieter hierarchy. Focused mobile layout/navigation checks passed at 320/390px, including simulated keyboard resizing; actual media/call flows were not retested for this UI change.
