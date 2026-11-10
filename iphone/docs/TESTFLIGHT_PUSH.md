# TestFlight push notifications

Native registration supports regular accounts and the authenticated Abdulrahman/Reham pair. Enable **الإعدادات → إشعارات التعارف والرسائل**, then allow notifications in iOS. This is opt-in; opening the app does not request permission.

## Apple APNs key

1. Apple Developer → Certificates, Identifiers & Profiles → Keys → +.
2. Name: `Nisfayn Push`. Enable Apple Push Notifications service (APNs).
3. Configure Production for TestFlight; if using topic-specific keys, allow `com.blindmatch.marriage`.
4. Register and download the `.p8` file. Apple allows this download once; store it securely.
5. Record its Key ID and your Apple Developer Team ID (Membership details). The Team ID is not the App Store Connect Issuer ID. The APNs key is separate from the App Store Connect build-upload key.

## Server configuration

Vercel → **nisfayn-admin** → Settings → Environment Variables → **Production**:

| Name | Value |
| --- | --- |
| `APNS_TEAM_ID` | Apple Developer Team ID |
| `APNS_KEY_ID` | New APNs Key ID |
| `APNS_PRIVATE_KEY_BASE64` | Base64 of the downloaded .p8, stored as a sensitive/secret variable |
| `APNS_TOPIC` | `com.blindmatch.marriage` |
| `APNS_ENVIRONMENT` | `production` |
| `NISFAYN_PUSH_ENABLED` | `true` |

Keep the existing CRON_SECRET and Nisfayn service credentials. Do not place the APNs private key in frontend variables, Git, or the iPhone bundle. Redeploy **nisfayn-admin** after setting the variables.

PowerShell to copy the encoded file without printing the secret (replace the path):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\AuthKey_KEYID.p8')) | Set-Clipboard
```

Paste it into the sensitive server variable, then clear the clipboard. Never paste the key contents into chat.

## New build and device test

Run Codemagic `Nisfayn · iPhone TestFlight` from main, then install the new build on both iPhones. The workflow enables VITE_MARRIAGE_PUSH_ENABLED. Push capability must be enabled on the Apple App ID and included in the distribution provisioning profile; the repository already declares the production entitlement.

Both users sign in and enable notifications. Put Reham's app in the background or lock her phone and send her a message from Abdulrahman. Repeat in reverse. Tap the notification to open the conversation. The worker runs once per minute, so allow roughly a minute plus APNs delivery time. Foreground OS banners are intentionally suppressed to avoid duplicating in-app chat updates. Focus modes and Scheduled Summary can delay presentation.

Current tester delivery covers new text/photo/voice messages and a reopened mutual match. Private message content/names are not included. Read or deleted messages, expired sessions, disabled notifications and closed matches invalidate queued deliveries. Incoming system call UI/VoIP wake-up is separate and is not enabled by this message-push setup.

An installed older TestFlight build does not gain native frontend changes from a website deployment. Physical-device receipt cannot be confirmed until the APNs credentials are configured and the new build is installed.

Apple references: https://developer.apple.com/help/account/keys/create-a-private-key and https://developer.apple.com/help/account/capabilities/communicate-with-apns-using-authentication-tokens/
