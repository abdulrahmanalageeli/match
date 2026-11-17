# Wudayn project context

Repository snapshot reviewed 17 November 2026. This is a development map, not evidence that every integration is enabled or release-tested. Inspect current source and Git status before acting; older documentation retains Nisfayn naming and sometimes superseded behavior.

## Product and implemented functionality

Wudayn is an Arabic RTL Saudi marriage application built around serious introductions, reciprocal preferences, privacy, and mutually agreed relationship steps. The product direction favors compact, polished iPhone interfaces, culturally appropriate Arabic, and purposeful animation. UI consistency should follow Explore / All Profiles and shared design tokens, rather than a new visual system per feature.

Implemented code covers:

- Password accounts, native Apple/Google sign-in, phone verification/consent completion for social accounts, profile onboarding, and resumable private drafts.
- Public profiles, interests, partner criteria, versioned compatibility/personality assessments, Beena scenarios, recommendations, discovery filters, requests, and curated introductions.
- Accepted-connection messaging, replies/reactions, media and voice notes, read/delivery state, private photos, voice calls, and seriousness agreements with relationship progression.
- Optional readiness passports with scoped sharing and Family Bridge guardian accounts, reviewed links, consented room rosters, and private family messaging.
- StoreKit membership purchases/restores, server receipt verification, administrative membership review, reports, blocking, account export/deletion, notification delivery, and maintenance workflows.

These are repository capabilities. Hosted provider activation, delivery, payments, and native acceptance must be verified separately.

## Architecture and source map

| Area | Entry points and responsibilities |
| --- | --- |
| Member app | `iphone/src/main.tsx` initializes Arabic RTL, callbacks, and keyboard handling; `App.tsx` selects member screens and lifecycle state; `Home.tsx` defines member tabs. |
| Community | `src/community/Community.tsx` coordinates discovery, profiles, requests, and chat. `data.ts` defines `CommunitySource` and real/demo behavior. `MatchesOverview.tsx` presents التعارف. |
| Backend adapters | `src/api.ts`, `cloud.ts`, and `deployment.ts` select/configure the member backend. `src/testing/pair.ts` serves the isolated private pair/simulation. |
| Database | `iphone/supabase/migrations/`, `functions/`, and `tests/`. Wudayn uses private `marriage` and tester-specific schemas with RLS and authorized RPCs. |
| AI | `src/interview/`, `src/ai/`, `api/interview.mjs`, `api/_lib/interview.mjs`, and `api/_lib/ai.mjs`. Model calls run server-side. |
| Native | `iphone/ios/App/App/` contains Capacitor bridges for auth, sessions/privacy lock, StoreKit, APNs, CallKit/PushKit/Agora, feedback, and private photos. |
| Staff and workers | `iphone/admin/` is a separate React/Vite app. Its trusted APIs support verification, signup SMS, push, and maintenance. Staff workflows use scoped authorization/MFA and auditing. |
| Presentation | `src/design.css`, `arrivalSurfaces.css`, `typography.css`, feature CSS, `BrandIcons.tsx`, reusable `src/ui/`, and `src/motion/`. |

The member UI is React DOM + Vite inside Capacitor, with application-state navigation. React Native Web/Reanimated and Skia are integrated through web aliases. SwiftUI and Expo Router are not its current navigation architecture. The root React Router event application and root Supabase work are separate. The legacy SQLite service is development-only.

## Significant decisions

- The dedicated marriage Supabase target is `wupkifqbwhhebwrgvwai`. Production and staging selection is constrained in `deployment.ts`; never repoint it casually to the event database.
- Supabase Auth and server-derived identity govern member access. Apple uses nonce-bound ID-token sign-in; Google uses a native authentication session and PKCE exchange. `SocialOnboarding.tsx` completes phone proof and explicit declarations. Local Face ID/passcode locking is separate from member verification.
- `CommunitySource` separates real, fictional, and private-pair backends. Preserve their distinct authorization and data handling.
- Compatibility is deterministic and reciprocal. The current assessment version is `marriage-v2`; valid legacy versions remain supported. Percentages require complete, non-provisional evidence. Beena and personality are distinct inputs, not automatic predictions of marital outcomes. Relevant database routines must agree with client behavior.
- Luna uses `gpt-6-luna`; current interview source declares prompt version `wudayn-interview-3`. It maps member statements to catalog-constrained suggestions with review/confirmation. The normal final profile save remains important. Other assistant/simulation modes have separate configuration. Do not copy older documented turn limits into new code without checking source.
- Private transcripts, unconfirmed answers, model credentials, and other members' information must not leak into public profiles or unrelated AI requests. AI does not approve members or invent compatibility scores.
- Native insets are reported into CSS variables; Capacitor uses `contentInset: 'never'`. Preserve keyboard, privacy-cover, and scroll-restoration handling.
- Website deployment and installed iPhone binaries have separate release lifecycles. Native integration or bundled UI changes need a new signed build.

## Limitations and technical debt

- Root instructions did not exist before this context task. Several READMEs retain older branding, assessment/auth behavior, and foreground-only calling descriptions. Source and newer feature-specific docs should resolve contradictions.
- `App.tsx` and `Community.tsx` own substantial orchestration. CSS has accumulated overlapping overrides; inspect effective specificity and lazy-loaded styles before editing. Refactoring requires a scoped task.
- StoreKit now routes to `.monthly.men` (SAR 149.99) and `.monthly.women` (SAR 99.99), with legacy `.monthly` receipt support. Product creation, receipt migration/Edge deployment and a new native build remain required; see `iphone/docs/APPLE_SUBSCRIPTIONS.md`. Sandbox purchase/restore/expiry acceptance is a release gate. The pending 17 November tier change separates approved free access from Premium initiation/compatibility details. The launch trial uses server-signed Apple eligibility and a disabled-by-default 50-per-gender allocation; see the subscription guide for activation and external-redemption limitations.
- Manual verification document collection is deliberately paused. Historical evidence/review and scoped claims remain implemented. See `iphone/docs/manual-verification.md`.
- Authentica photo comparison is implemented for new real male-member photos. Provider activation and independent liveness guarantees are unverified here. See `iphone/docs/authentica-face-verification.md`.
- Readiness is self-declared; external issuer verification is documented as inactive. Family links do not independently prove legal guardianship. See `iphone/docs/readiness-passport.md` and `family-bridge.md`.
- Native private-photo capture protection relies on an undocumented secure-text canvas. Screenshot notifications arrive after capture. Physical-device testing is necessary; no general capture-prevention guarantee is justified.
- Native call, notification, social-login, SMTP recovery, payment, and verification provider readiness cannot be established from source alone. No live configuration audit was performed during onboarding.

## Recent work and unfinished implementation

Recent Git history includes social-auth restoration, safe-area/keyboard work, compact Explore filters and actions, circular avatars, shared compatibility ring meters, Relationships layout refinements, and shared app styling. The latest reviewed commit is `e15892c3`, adding All Profiles shuffling on refresh/resume. Background presence updates preserve the current order; pagination currently operates on backend pages with client-side shuffling rather than globally randomized server pagination.

At review time four files contained pre-existing uncommitted one-time-photo work: `src/community/ChatMedia.tsx`, `src/community/privatePhoto.ts`, `src/help/guide.ts`, and `tests/chat-private-media.test.mjs` under `iphone/`. They block browser redemption/display of one-time photos and adjust guidance/tests. This is a dated observation; verify Git status before assuming it remains pending. Native screenshot behavior remains unverified by those changes.

Historical release notes and conversation reports may describe live data changes. This document does not certify their current state. Inspect authorized live records only when a task requires it; never infer a user's visibility, subscription, or photo state from a client patch.

## Validation and further reading

Run the smallest relevant test first. Member scripts in `iphone/package.json` provide typecheck, production/demo builds, unit tests, and Capacitor sync. Admin has separate test/build scripts; database tests in `iphone/supabase/tests/` use PGlite. `.github/workflows/nisfayn.yml` runs member, admin, and database checks. `codemagic.yaml` defines manual iPhone signing/archive/upload workflows. This documentation task did not rerun builds/tests or inspect current CI results.

Useful entry points, read only when relevant:

- `iphone/README.md` and `iphone/supabase/README.md` — baseline setup, with the stale-document caveat above.
- `iphone/docs/guided-interview.md` — Luna flow, evidence, consent, and recovery; reconcile limits with current source.
- `iphone/docs/blindmatch-evidence.md` — evidence behind reciprocal preferences and limits on outcome claims.
- `iphone/docs/member-profile-lifecycle.md` — profile review and discovery pause; accepted relationships can remain available.
- `iphone/docs/NATIVE_EXPERIENCE.md` and `iphone/ios/TESTFLIGHT.md` — native boundaries and physical-device acceptance.
- `iphone/docs/family-bridge.md`, `readiness-passport.md`, `manual-verification.md`, and `authentica-face-verification.md` — feature-specific access and product constraints.

Previous conversations on other Codex accounts were not inspected. Repository history and documentation are recoverable evidence; absent context should be labeled unverified rather than invented.
