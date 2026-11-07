# Nisfayn foreground voice calls

The iPhone app uses a local Capacitor 8 plugin, `NisfaynVoice`, backed by Agora's **audio-only iOS SDK 4.7.0** (`RtcBasic`). The remote Swift package is pinned in `App/App.xcodeproj/project.pbxproj`. Keep it there: Capacitor regenerates `CapApp-SPM/Package.swift` on sync.

The bridge is transport only. The authenticated application server must verify mutual-match access and both parties' consent before issuing a short-lived channel token bound to the caller's numeric UID. No App Certificate or server secret belongs in the app. App ID, channel and token are supplied to `join` in memory; this plugin does not persist or log them. Agora file logging is disabled. Do not log bridge calls or their arguments in the frontend.

## JavaScript contract

Register with `registerPlugin<NisfaynVoicePlugin>('NisfaynVoice')` on iOS. Subscribe before joining and remove listeners when the call UI is released.

```ts
interface NisfaynVoicePlugin {
  join(options: { appId: string; channel: string; token: string; uid: number }): Promise<{ uid: number }>;
  leave(): Promise<void>;
  mute(options: { muted: boolean }): Promise<void>;
  setSpeaker(options: { enabled: boolean }): Promise<void>;
  renewToken(options: { token: string }): Promise<void>;
}
```

`join` resolves after Agora confirms joining, rather than after the join request is sent. A rejected join is cancelled and releases audio resources. An explicit `leave` waits until engine destruction completes. Calling leave again is safe. Joining during teardown rejects with `VOICE_BUSY`; wait for `leave` to resolve before another join.

| Event | Payload |
| --- | --- |
| `joined` | `{ channel: string, uid: number }` |
| `remoteJoined` | `{ uid: number }` |
| `remoteLeft` | `{ uid: number, reason: number }` |
| `left` | `{ reason: 'local' \| 'background' \| 'interrupted' \| 'audio_reset' \| 'error' }` |
| `error` | `{ code: number, message: string }` (sanitized Arabic copy) |
| `tokenWillExpire` | `{}` — get a fresh authorized server token, then call `renewToken` |
| `tokenExpired` | `{}` — attempt an authorized refresh or end the call |
| `connectionStateChanged` | `{ state: number, reason: number }` (Agora enums) |

Channel names are restricted to 1–64 ASCII letters, digits, underscore or hyphen. UID must be an integer in 1…4,294,967,295. Do not use UID zero, because the server token is bound to the authenticated participant's explicit UID. `mute`, `setSpeaker` and `renewToken` resolving means the native SDK accepted the command; network errors still arrive as events.

## Audio and lifecycle

Microphone permission is requested only when the user starts or accepts a call and the frontend invokes `join`. `Info.plist` contains the Arabic microphone purpose text. Permission denial rejects the promise with `VOICE_MICROPHONE_DENIED`. The plugin configures `AVAudioSession` for `.playAndRecord` / `.voiceChat` with Bluetooth HFP support; receiver is the initial route, and the speaker control uses Agora routing. Connected system headsets can affect the actual route.

This version is **foreground only**. Moving the app to the background, locking the phone, an audio interruption, or an audio-services reset ends the native session. The frontend must reconcile any `left` event with the server call record. A network reconnect can occur while the app remains foreground; terminal SDK errors end the session. No background audio/VoIP modes, PushKit or CallKit are added. Ordinary push notification setup does not provide system incoming-call handling.

## Required iPhone verification

The Windows workspace cannot compile or run the iOS target. SDK method names were checked against the official 4.7.0 XCFramework headers; this is not a substitute for an Xcode build and two-device audio test.

On a Mac with the app's required Xcode version, resolve the pinned packages and build `App/App.xcodeproj`. Use two physical iPhones and real server-issued tokens to verify: start/accept and two-way speech; denied microphone permission; mute/unmute; receiver/speaker/Bluetooth; token renewal; remote hangup; leaving during permission/join; repeated call after teardown; network reconnection; background/lock/interruption ending the call and releasing the microphone. Confirm the existing welcome/celebration audio still plays after a call. No real call or native device test is claimed by a web build or Capacitor sync.

Sources: [Agora official audio package 4.7.0](https://github.com/AgoraIO/AgoraAudio_iOS/blob/4.7.0/Package.swift), [Agora audio sample](https://github.com/AgoraIO/API-Examples/blob/main/iOS/APIExample-Audio/APIExample-Audio/Examples/Basic/JoinChannelAudio/JoinChannelAudio.swift), [Agora token authentication](https://github.com/AgoraIO/docs-portal/blob/main/content/docs/en/realtime-media/voice/build/set-up-token-authentication/use-tokens.mdx), [Capacitor 8 local native plugins](https://capacitorjs.com/docs/ios/custom-code).
