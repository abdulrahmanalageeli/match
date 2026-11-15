# Wudayn native iPhone app

This is the separate SwiftUI migration target. It uses native navigation, forms,
photo picking, camera, audio, notifications, CallKit, Keychain and StoreKit. The
target has no Capacitor or WebView dependency. Existing authenticated server APIs
and account permissions remain authoritative; this migration does not reset
accounts, change passwords, or grant roles.

The shipped Capacitor target remains in `iphone/ios` until the native candidate
has passed release validation. Compiling this target does not update TestFlight.

## Build and test on macOS

From this directory:

```sh
swift test
brew install xcodegen
xcodegen generate
xcodebuild -project WudaynNative.xcodeproj -scheme WudaynNative \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

The `Wudayn SwiftUI` GitHub workflow runs the core tests, simulator build and
XCTest navigation smoke test. Screenshots, logs and the xcresult are artifacts.
UI tests use a DEBUG-only local fixture transport: they do not send real member
messages, purchase subscriptions or modify production profiles. They cover login,
discovery, sending a message, settings and exclusions, and assert no web view.
They are not a complete end-to-end backend or feature-parity test.

The manual `wudayn-swiftui-testflight` Codemagic workflow builds a signed IPA using
the existing signing integration. It does not automatically publish that IPA.

## Implemented native screens

Login, member signup/SMS verification, profile and partner preferences, staged
onboarding portrait and face check, assessment/interview, discovery and filters,
member profiles, requests, text/photo/voice chat, one-time photo presentation,
seriousness agreements, calls, shared photos, readiness and journey, family
links/rooms, notifications, settings, exclusions, support, membership, account
export/deletion and legal text have native implementations. Backend authorization
continues to enforce account eligibility and access to these operations.

Catalog and legal resources come from the existing application. Regenerate them
from the repository root with `node iphone/scripts/export-native-resources.mjs`.

## Release work still required

- Verify physical iPhone recording/playback, interruptions, Bluetooth, incoming
  and background calls, APNs delivery, device lock and account switching.
- Verify one-time photos on supported iOS versions, including screenshots,
  recording, app switching and failure paths. The reused secure-text rendering
  technique relies on UIKit behavior that is not a documented screenshot-blocking
  API; simulator compilation does not prove screenshot prevention.
- Exercise production-equivalent signup, photo review, interview confirmation,
  member/family interactions and StoreKit sandbox purchase/restore with test
  accounts. The current fixture test does not verify these backend flows.
- Complete feature-parity review before replacing the shipping target. Native
  chat does not yet persist drafts/outbox across navigation or display typing
  presence. Loaded message pages now reconcile on refresh and clear on access denial.
  Family login supports existing accounts; dedicated guardian signup needs
  a separate parity check. Profile drafts currently remain in view state.
- Configure `WUDAYN_PASSWORD_RECOVERY_URL` to the deployed HTTPS recovery page
  and allow it in the dedicated project's Auth redirect configuration. The
  default is empty, so recovery currently shows the existing support fallback.
- Review signed device build and archive before distributing through TestFlight.

The admin website, server APIs and email recovery destination are intentionally
web services. Admin privileges remain attached to the existing server account;
the member app does not embed the admin website. Keeping an HTTPS recovery page
allows email links to work on devices where the app is not installed.
