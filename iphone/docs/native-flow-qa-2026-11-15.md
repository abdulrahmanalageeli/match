# Native account-to-chat regression pass — 15 November 2026

Scope: the SwiftUI candidate on `codex/wudayn-swiftui`, existing member backend
contracts, and the legacy iPhone regression suite. No real member passwords,
permissions, matches or messages were changed. No TestFlight release was made.

## Findings fixed

- Signup SMS responses could restore proof for edited credentials. Bind responses
  to the active challenge, validate email/password/OTP/proof, clear verification
  when consent is revoked, and lock request inputs while a request is running.
- Signup portrait finalization preceded profile creation, which the server rejects.
  Save the profile first and preserve the stage receipt for a partial-failure retry.
- Interview questionnaire edits were reset on return; initial load and skip retry
  behavior also needed correction. Preserve edits and use a separate skip ID.
- Discovery dismissal/blocking left stale candidates visible. Remove them and
  return to the refreshed list; discard late inbox refreshes and denied content.
- Profile portraits did not recheck access while visible. Revalidate the authorized
  image variant and clear images when backgrounded or no longer authorized.
- Chat retained private content after denied access and retained stale older pages.
  Clear denied threads/drafts and rebuild the entire loaded message window.
- Background polls erased send failures before users could read them. Keep send
  warnings separate from refresh errors until the next send attempt.
- Add a native Done action to dismiss the signup phone/OTP keypad.
- Single-use photo attempts could be repeated after a lost response. Mark the
  attempt locally spent before downloading; do not automatically replay it.
- Search pagination used the wrong cursor. Use the oldest ascending result and
  discard responses for stale queries; refresh shared-photo authorization.
- Recording could start after a delayed microphone permission response even if the
  user had left the screen. Invalidate that continuation on discard/background.
- Failed call-end requests could allow local audio reconnection. Stop reconnecting
  immediately and use fresh IDs for later calls.
- Upload failure handling needed to distinguish an unpublished upload from a
  successfully committed photo whose response was lost. Reconcile before cleanup.
- Terminal refresh errors could delay privacy clearing. Remove revoked credentials
  and return a signed-out error; retain HTTP status for other request failures.
- Recovery URL validation rejected valid HTTPS destinations inside query parameters.
  Validate the resolved backend origin and test redirect query round-tripping.

## Verification and limits

Core tests cover account isolation, concurrent refresh, revoked sessions, mutation
retry behavior, one-time media, upload bounds, signup validation and chat paging.
Simulator tests use a DEBUG-only synthetic transport; they cover signup consent
and bad OTP, failed login and acceptance, uncertain send retries and denied chat
access, in addition to the original discovery/chat/settings/exclusions smoke test.
These tests do not prove successful delivery through live SMS or media providers.

Seven live non-mutating rejection checks passed: anonymous state, discovery,
inbox, media and interview returned 401; empty member-signup and SMS requests
returned 400. No real phone number or authenticated user token was supplied.

The complete legacy package suite passed **596/596**, with no skips or failures,
using Node test concurrency 4. TypeScript checking passed. Fixture repairs preserve
existing product assertions and isolate browser styles, native calls and auth side
effects from Node-only tests. Evidence: `tmp/account-flow-full-unit-final.log`.
The local browser signup check also passed (including height/weight, consent,
partner criteria and family timing); external requests were blocked. Admin tests
passed **58/58**. All **176/176 database tests** passed using disposable PGlite
instances, never live users. Evidence: `tmp/account-flow-database-final.log`.
Current signup-gate rejection tests remain in place; tests of established accounts
seed established profiles instead of depending on obsolete minimal signup payloads.
The native build passed all **21 core tests** and simulator compilation. The final
The user requested stopping further checks. Cancellation was requested for the
final [macOS run](https://github.com/abdulrahmanalageeli/match/actions/runs/43708398783)
and [Linux run](https://github.com/abdulrahmanalageeli/match/actions/runs/43708398760).
The final signup UI rerun was not confirmed. The preceding run passed the chat
failure/retry/revocation scenario and navigation smoke test, but signup automation
was interrupted by the system password suggestion. Its latest fixture correction
is pushed; no complete UI pass is claimed.

The signup UI fixture disables the system strong-password suggestion only under
the DEBUG UI-test flag, because the simulator overlay intercepted test keystrokes.
Real signup retains password AutoFill. Linux exposed a repeatable PGlite teardown
error in the pair-deletion test. A test hook confirmed the assertions completed
before shutdown failed. The test-only runtime was upgraded from PGlite 0.3.14 to
0.4.6, retaining PostgreSQL 17. Its [upstream lifecycle change](https://github.com/electric-sql/pglite/commit/d848955)
removes the old filesystem shutdown path. No privacy assertions were removed.
All 176 database tests also passed with only tracked migrations, UTC, and CI's
Node 22.23.4; the unrelated untracked portrait migration is excluded from that run.

Physical-device microphone, Bluetooth, incoming/background calls, APNs delivery,
one-time screenshot protection and StoreKit remain unverified. Successful real
SMS signup, photo-verification service integration and two real members interacting
still require controlled integration testing. Password recovery still needs a
configured HTTPS destination. Other feature-parity items remain in the native README.
