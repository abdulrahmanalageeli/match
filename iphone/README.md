# نصفين · Nisfayn for iPhone

An Arabic, right-to-left marriage app built with React, Capacitor, and native StoreKit. The supplied نصفين identity pairs Tajawal and Montserrat with burgundy, dusty rose, ivory, and soft gold. The launch and welcome screens feature the original logo above a Riyadh skyline and dunes. Matching uses interests and preference questions from the BlindMatch event. The marriage app has its own Supabase project and member data.

## Preview

The [BlindMatch evidence report](docs/blindmatch-evidence.md) explains which event questions informed the new marriage assessment and how to interpret the numbers. **ترشيحات الأسبوع** shows up to five reciprocal candidates. Each fit card distinguishes the topics both people answered, the preferences that align and questions they may want to discuss. The pilot uses a deterministic matching formula with member-selected priorities. It never displays a marriage success percentage.

Use Node 22.13 or later. From the `iphone` directory:

```sh
npm ci
npm run dev
```

Open the Vite URL and select **جرّب إعداد الملف** to try the five-step Arabic onboarding: identity, personal story, compatibility, partner preferences, and review. Each step validates independently. You can return to any answer from review; **إكمال لاحقًا** retains the unfinished profile in memory for the current session. Closing or reloading the app discards it. No real profile or subscription is created in either demo.

Choose **استكشف التجربة** to enter as a fictional member. **الطلبات** is for introductions; accepting one opens a private conversation. **المحادثات** lists accepted conversations with search, previews and unread counts. Sends appear immediately; a failed message has a retry action that reuses its original identifier. A thread is marked read only when its newest message is visible. **الإعدادات** includes profile editing, membership, pause/resume, privacy, larger text, reduced motion and account actions. The device's reduced-motion preference also applies automatically.

## Supabase membership flow

Before inviting the public, configure a verified sender through custom SMTP and set the confirmation redirect to your real onboarding address. Supabase's default mail service restricts delivery to project-team addresses. [Supabase Auth email delivery](https://supabase.com/docs/guides/auth/auth-smtp)

The default client configuration in [deployment.ts](src/deployment.ts) targets the dedicated marriage project, `wupkifqbwhhebwrgvwai`. Configure an alternative marriage environment by setting **both** of the following build-time values, then restarting Vite or rebuilding and syncing the native app:

```dotenv
VITE_MARRIAGE_SUPABASE_URL=https://YOUR_MARRIAGE_PROJECT.supabase.co
VITE_MARRIAGE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Keep all service-role credentials and Apple verification secrets on trusted servers. The client explicitly rejects the event database host. Use [Supabase setup and migrations](supabase/README.md) for Auth settings, private normalized tables, RLS, narrowly scoped RPCs, trusted Apple functions, and verification instructions.

1. The member registers, confirms their email when required, and submits a profile with preferences and explicit consent.
   On iPhone, **إكمال لاحقًا** explicitly saves the unfinished profile in the device-only Keychain so the same member can resume within seven days after closing the app. Ordinary typing and the browser demo stay in memory. A resumed draft requires fresh consent; submitting it, signing out or deleting the account clears the saved draft.
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

For paid use, register the bundle ID `com.blindmatch.marriage` and the monthly product `com.blindmatch.marriage.monthly` in App Store Connect. Configure the Saudi storefront price there. SAR 129 is the proposed price; the app displays the localized price Apple supplies at checkout. Configure trusted Apple certificates, the notification endpoint, and the sandbox/production settings documented in the [Supabase guide](supabase/README.md). Verify the full purchase, restore, cancellation, and expiry flow in Apple’s sandbox before distributing a signed TestFlight build. Public release also requires the operator’s contact details, public privacy and terms URLs, and an approved identity-review and licensing process.

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

Accepted conversations now include foreground Agora voice calls. The public preview provides a labeled simulation without microphone access. The app uses a pinned native audio-only iOS bridge and a lazy-loaded browser transport; its certificate is stored only in Supabase Edge secrets. See [voice backend and access rules](docs/voice-calls.md), [native setup and device checks](ios/VOICE_CALLS.md), and [verified release state](docs/voice-release.json). Background/locked-screen incoming calls are not implemented yet.

From `iphone`, run `npm run typecheck`, `npm run build`, and `npm run ios:sync`. Run `node --experimental-strip-types --test src/community/chatOutbox.test.mjs` for chat retry and ordering checks. From `supabase/tests`, run `npm ci` and `npm test` to exercise the migration SQL and access rules. The mobile walkthrough was checked at iPhone viewport size in Chromium on Windows. Compiling and signing the native binary and exercising real StoreKit transactions require macOS, Xcode, and Apple configuration.
