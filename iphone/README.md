# نصفين · Nisfayn for iPhone

An Arabic, right-to-left marriage app built with React, Capacitor, and native StoreKit. The supplied نصفين identity pairs Tajawal and Montserrat with burgundy, dusty rose, ivory, and soft gold. The launch and welcome screens feature the original logo above a Riyadh skyline and dunes. Matching uses interests and preference questions from the BlindMatch event. The marriage app has its own Supabase project and member data.

## Member website and private testing

The [BlindMatch evidence report](docs/blindmatch-evidence.md) explains which event questions informed the new marriage assessment and how to interpret the numbers. **ترشيحات الأسبوع** shows up to five reciprocal candidates. Each fit card distinguishes the topics both people answered, the preferences that align and questions they may want to discuss. The pilot uses a deterministic matching formula with member-selected priorities. It never displays a marriage success percentage.

Use Node 22.13 or later. From the `iphone` directory:

```sh
npm ci
npm run dev
```

The normal homepage and `npm run build` use real member registration. Signup currently has no email-confirmation step, at the owner's request; it creates a real Auth account marked with unverified email ownership. It does not approve the profile or grant membership. The existing private Abdulrahman/Reham accounts remain at `?test=1`; Abdulrahman's password protection is unchanged. Settings' onboarding walkthrough remains fictional.

Signed-in onboarding automatically saves a private account draft, with save status and retry. The same member can resume after reload, logout or on another device for seven days after the latest save. New photographs are excluded and explicitly require reselection. Processing-purpose choices can resume; publication and final signup declarations are not silently accepted. Drafts never appear in discovery, are removed after successful submission/account deletion, and expire through the existing maintenance worker.

## Supabase membership flow

Ordinary member signup uses the dedicated `member-signup` Edge Function without SMTP. See [the signup security boundary](docs/member-signup-2026-11-08.md). Staff signup keeps its confirmation/MFA requirements. Password-reset email delivery still needs a verified SMTP sender and correct recovery redirect; this release does not claim that delivery is configured. [Supabase Auth email delivery](https://supabase.com/docs/guides/auth/auth-smtp)

The default client configuration in [deployment.ts](src/deployment.ts) targets the dedicated marriage project, `wupkifqbwhhebwrgvwai`. Configure an alternative marriage environment by setting **both** of the following build-time values, then restarting Vite or rebuilding and syncing the native app:

```dotenv
VITE_MARRIAGE_SUPABASE_URL=https://YOUR_MARRIAGE_PROJECT.supabase.co
VITE_MARRIAGE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Keep all service-role credentials and Apple verification secrets on trusted servers. The client explicitly rejects the event database host. Use [Supabase setup and migrations](supabase/README.md) for Auth settings, private normalized tables, RLS, narrowly scoped RPCs, trusted Apple functions, and verification instructions.

1. The member registers and submits a profile with preferences and explicit consent. Private drafts save automatically to the member account. Logging out clears local state and preserves the account draft for later sign-in; submitting or deleting the account removes it.
2. An operator independently verifies adulthood and reviews the application. Checkout becomes available when a compatible approved counterpart exists.
3. Apple handles the subscription. A server-verified active entitlement opens discovery and requests. Only mutually accepted requests open a chat. An operator-curated introduction can share the member’s designated contact after both people accept it.
4. Members can pause matching, block, report, and delete their account. An operator reviews reports and can suspend accounts. Apple handles future billing and cancellations.

## Run on an iPhone

Use Xcode 26 or later on a Mac and an iPhone running iOS 16 or later:

```sh
npm ci
npm run ios:sync
npm run ios:open
```

Select the **App** scheme, choose the development team under **Signing & Capabilities**, and run on the device. The Xcode project includes the نصفين icon and launch screen, Keychain session storage, and StoreKit bridge.

The requested monthly Saudi prices are SAR 149.99 for men and SAR 99.99 for women; trial/demo displays use the member's profile gender. Paid checkout currently uses the single StoreKit product `com.blindmatch.marriage.monthly` under bundle `com.blindmatch.marriage`, and displays Apple's localized price. Separate pricing still requires App Store Connect configuration and matching StoreKit/server product routing; changing the display does not change what Apple charges. Configure trusted Apple certificates, the notification endpoint, and the sandbox/production settings documented in the [Supabase guide](supabase/README.md). Verify the full purchase, restore, cancellation, and expiry flow in Apple’s sandbox before distributing a signed TestFlight build. Public release also requires the operator’s contact details, public privacy and terms URLs, and an approved identity-review and licensing process.

## Optional local SQLite development

The earlier local service is available for working on account, application, and curated-introduction flows. In a development-only environment file set `VITE_MARRIAGE_BACKEND=local`, restart Vite, and start the service in a second terminal:

```sh
cd service
npm ci
npm test
npm start
```

Vite proxies local requests to port 8787. That service uses its own SQLite file and operator CLI. Live member discovery and mutual chat use Supabase; the fictional walkthrough also exercises these flows. See [local service setup](service/README.md).

## Checks

Accepted conversations include Agora voice calls. Browser tab hiding no longer immediately hangs up; returning validates the server call and resumes or repairs media while preserving mute/timer. Browser suspension and server expiry can still end a call. Background/locked-screen incoming calling is not implemented. The certificate remains only in Supabase Edge secrets. See [voice backend and access rules](docs/voice-calls.md) and [native setup and device checks](ios/VOICE_CALLS.md).

Web Push for requests, mutual acceptance and unread messages uses an opt-in, session-bound private queue and the admin production worker every minute. On iPhone, install to the Home Screen before enabling notifications. Native APNs remains separately gated. See [Web Push setup and device acceptance](docs/web-push-setup.json).

From `iphone`, run `npm run typecheck`, `npm run build`, and `npm run ios:sync`. Run `node --experimental-strip-types --test src/community/chatOutbox.test.mjs` for chat retry and ordering checks. From `supabase/tests`, run `npm ci` and `npm test` to exercise the migration SQL and access rules. The mobile walkthrough was checked at iPhone viewport size in Chromium on Windows. Compiling and signing the native binary and exercising real StoreKit transactions require macOS, Xcode, and Apple configuration.
