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

## Privacy and navigation follow-up

- Optional Quiet and Horizon icons are bundled as alternate iOS app icons. Selecting
  one first saves private notification previews, then hides caller names and switches
  the icon. The installed display name stays نصفين. Returning to the branded icon
  does not silently re-enable message previews.
- Incoming calls default to a generic title. An optional caller-name preference uses
  a server-validated call-state response after the initial CallKit report.
- Voice playback positions stay in session memory per authenticated source and
  attachment. Leaving/reopening a chat resumes; completed notes restart. Audio and
  signed media URLs are never saved in that memory.
- Deadline reminders are queued once per installation/agreed deadline during the
  final 24 hours, delivered silently with generic copy, and revalidated at send time.
  Extensions require another participant's acceptance. No stage advances on expiry.
- Real members now use private persisted agreements; tester accounts retain their
  existing agreement and gain mutually approved extensions.
- Member/tester Family Bridge alerts recheck room participation, consent and read
  state. They open the exact authorized room/message, with no private-chat reply
  action attached. Guardian-only accounts do not yet have native push registration.
- Notification routes wait for authenticated connection lookup. Message targets load
  older pages where needed; Face ID must unlock before consuming the native intent.

Device checks: switch each icon and restore branding; confirm privacy settings stay
hidden; test named/generic locked-screen calls; open message, reminder and family
alerts after a cold launch and canceled/successful Face ID. Native Swift compilation
and these device behaviors require the next Codemagic/TestFlight build.

Sender avatars in Apple's communication-notification layout are not included.
