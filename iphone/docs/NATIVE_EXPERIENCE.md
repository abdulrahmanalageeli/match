# iPhone calls, privacy and notifications

This release requires a new signed TestFlight build. The website continues using
browser audio, and older installed builds retain their foreground-only transport.

- `NisfaynCallCenter` owns CallKit, PushKit, the audio SDK, native token renewal and
  routing. It starts at application launch, including a background VoIP launch.
- Incoming VoIP pushes contain only a call ID and installation ID. They are
  reported to CallKit before network I/O. Acceptance, state and every 120-second
  audio grant use the existing mutual-consent checks through a scoped gateway.
- The native credential is stored in device-only Keychain storage accessible
  after first unlock, expires, and is bound to a live login session. It cannot
  fetch profile or message history. Account changes clear the binding.
- The immediate `/api/call-push` route uses the existing APNs signing key with the
  `com.blindmatch.marriage.voip` topic. The key must authorize that topic. Do not
  send VoIP pushes for ordinary messages, cancellations or background refresh.
- CallKit owns audio-session activation. Available Bluetooth/HFP inputs appear in
  the audio output sheet; disconnection and token renewal have bounded deadlines.
- Settings offer optional Face ID/device-passcode locking and immediate/one/five
  minute lock delay. The native privacy cover hides app-switcher snapshots.
- APNs messages are grouped by thread. Preview privacy is private by default,
  with explicit sender-only and sender-plus-text choices, evaluated at delivery.
  Private photo content is never attached. The badge counts unread messages.
- Reply and mark-read actions open the app and wait for the app lock to unlock.
  Replies use a stable client ID to avoid duplicates if delivery is retried.
  This intentionally does not claim silent background replies or screenshot
  prevention; iOS has no supported general screenshot-blocking API for chats.

## Release verification

Local checks cover TypeScript, production web builds, SQL authorization/consent,
session revocation, privacy changes while queued, deleted-message suppression,
and APNs alert/VoIP headers. Swift must additionally compile in Codemagic.

Before describing the native experience as device-verified, use two iPhones:
1. Install the new build; sign in as Abdulrahman and Reham. Grant microphone and
   notification permissions. Call in both directions with the receiver locked.
2. Answer/decline/end from Apple's screen. Confirm remote cancellation, muted
   microphone, Bluetooth route changes, a cellular-call interruption, Wi-Fi/mobile
   handoff, and expiry after removing call consent or signing out.
3. Confirm message banners, all three privacy options, grouped notifications,
   badge clearing, and reply/read after Face ID success and cancellation.
4. Verify app-switcher privacy and lock delays, including cold launch, failed
   authentication, and changing accounts. No private screen should flash first.

Sender avatars in Apple's communication-notification layout and alternate app
icons are not included in this release. They require additional native artwork/
notification-extension work; neither changes the installed app's display name.
