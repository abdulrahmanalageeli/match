# First TestFlight build (Windows + Codemagic)

The repository-root `codemagic.yaml` builds the Capacitor app in `iphone/` using
Swift Package Manager, including the existing native voice, session and push plugins.
It runs manually and uploads to App Store Connect without submitting to the public
App Store or automatically inviting external testers.

## One-time account setup

1. Sign into https://codemagic.io with GitHub. Add repository
   `abdulrahmanalageeli/match` as an **Other / YAML** application. Use branch `main`.
   Limit the GitHub integration to the repository you intend to build.
2. In Apple Developer → Certificates, Identifiers & Profiles, register an explicit
   App ID: `com.blindmatch.marriage`, description `Nisfayn`. Enable Push Notifications
   (the project has an APNs entitlement).
3. In App Store Connect → My Apps → + → New App, create an iOS app named نصفين
   (or an available name), choose that bundle ID, Arabic, and SKU `nisfayn-ios`.
4. In App Store Connect → Users and Access → Integrations → App Store Connect API,
   create a dedicated team API key with App Manager access. Download its `.p8`
   file and record the Issuer ID and Key ID. Keep the key out of Git and chat.
5. In Codemagic → Team settings → Team integrations → Developer Portal → Manage
   keys, add that key and name the integration **`Nisfayn Codemagic`** exactly.
6. In Codemagic → Code signing identities → iOS certificates, generate an
   **Apple Distribution** certificate using that integration. Follow Codemagic's
   download/upload instructions so the certificate and private key are stored
   in Code signing identities. Reuse an existing compatible certificate if present.
7. In Apple Developer → Profiles, create an **App Store Connect** distribution
   profile for `com.blindmatch.marriage` using that certificate. Fetch or upload
   it under Codemagic's iOS provisioning profiles. Confirm a matching certificate
   is shown. Create the profile after enabling Push Notifications.

## Run and install

1. In Codemagic's app, scan `main` for `codemagic.yaml`.
2. Start workflow **Nisfayn · iPhone TestFlight**. Check the displayed build-minute
   allowance/pricing before starting. No automatic build triggers are configured.
3. After upload and Apple processing, open App Store Connect → app → TestFlight.
   Complete any required export-compliance questions based on the actual app.
4. Create an internal testing group, add yourself and the build, and accept the
   invitation in TestFlight on your iPhone.
5. For Reham without developer-console access, use an external testing group.
   Complete beta information/reviewer access and submit the first external build
   to Apple's beta review before sending her the invitation.

The numeric build version uses Codemagic's project build counter plus one. Keep
this Codemagic project as the build-number source; if migrating an existing app
with higher uploaded versions, increase the counter before starting.

This build uses Nisfayn's current production Supabase project. Native APNs delivery
still needs server-side APNs credentials; the signing key above is not an APNs key.
Voice currently runs in the foreground (see `VOICE_CALLS.md`). A successful web
build is not evidence that the native app compiles or that device calls work.
The first signed cloud build and physical-device tests remain required.

References:
- https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/
- https://docs.codemagic.io/yaml-code-signing/signing-ios/
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
