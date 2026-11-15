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
The native build passed all **21 core tests** and simulator compilation. Its UI
result is tracked in [the macOS run](https://github.com/abdulrahmanalageeli/match/actions/runs/43703446144).

Physical-device microphone, Bluetooth, incoming/background calls, APNs delivery,
one-time screenshot protection and StoreKit remain unverified. Successful real
SMS signup, photo-verification service integration and two real members interacting
still require controlled integration testing. Password recovery still needs a
configured HTTPS destination. Other feature-parity items remain in the native README.
