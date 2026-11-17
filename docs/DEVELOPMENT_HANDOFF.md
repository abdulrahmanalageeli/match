# Wudayn development handoff

Reviewed 17 November 2026. Read `AGENTS.md` first and `docs/AI_PROJECT_CONTEXT.md` for architecture. This handoff records repository evidence and the next work; it does not establish current deployment or device acceptance.

## Repository status

- Branch: `codex/restore-social-auth-safe-area`.
- HEAD: `e15892c3a4a9469649addfaf4f4b4f31b3d234bb` — Shuffle All Profiles on refresh and resume.
- Local `origin/main` points to the same commit. No fetch was performed during this review, so remote freshness is unverified.
- Four pre-existing modified files form one pending private-photo change: `iphone/src/community/ChatMedia.tsx`, `iphone/src/community/privatePhoto.ts`, `iphone/src/help/guide.ts`, and `iphone/tests/chat-private-media.test.mjs`.
- `AGENTS.md` and `docs/AI_PROJECT_CONTEXT.md` are newly created, untracked documents from the preceding context task. This handoff is also new. Do not accidentally include or omit them when preparing a later authorized commit.
- No application code, existing work, configuration, or infrastructure was changed during this handoff task. Tests/builds were not rerun.

## Where development left off

Recent committed work is incremental product polish, not an architectural rebuild:

| Commit | Significant result |
| --- | --- |
| `e15892c3` | All Profiles shuffles on refresh and visibility resume; presence updates preserve ordering. |
| `8538c1bc` | Private tester views use Reham's avatar instead of her portrait. This client behavior does not establish live member visibility. |
| `ef76487b` | Relationships chat shortcut matches the bare Explore icon. |
| `a6ac1d49`, `6c457472`, `6f8851df` | Relationships tab ring iterations and shared gradient compatibility ring. |
| `5772caa5`, `57e17f2f` | Shared app styling and compact Relationships layout. |
| `9e66e36c` and subsequent Explore commits | Pull-to-refresh, portraits, compact filters/actions, add branding, and percentage-based meters. |

Earlier relevant work includes `958f23ca` (social sign-in and safe areas), `1788d54a` (welcome/account safe areas), `c8d95feb` (native single-use photo viewer), and Luna recovery commits `1d9cdb8b`, `df915f4a`, and `6bd953a6`. Their existence is not evidence of an unresolved failure.

## Confirmed unfinished work

### One-time photo browser restriction and native privacy acceptance

Purpose: prevent one-time photos from falling back to an ordinary browser image, while retaining native single-use viewing and cleanup.

The working-tree patch rejects browser opening in `preparePrivatePhoto()` before calling the consuming `source.openMedia()`. `ChatMedia.tsx` removes the one-time HTML viewer path, routes through the native viewer, and adds a consumed-download failure message. Help/composer text explains iPhone-only opening. The revised test harness exercises the real preparation module with a mocked Capacitor bridge and checks browser non-consumption, native viewing, and lifecycle cleanup.

Remaining: review and validate the four-file patch together, decide release treatment of browser recipients, then commit/release only with authorization. The original native capture complaint remains unresolved by browser-only changes. Inspect `iphone/ios/App/App/PrivatePhotoPlugin.swift`, `iphone/src/community/privatePhoto.ts`, and `iphone/ios/TESTFLIGHT.md` together.

Dependencies/blockers: a current signed build and physical iPhone are needed to assess hardware screenshots, recording/mirroring, app-lock/background behavior, and reopened messages. Native protection uses an undocumented secure UITextField canvas; discovering that canvas does not prove screenshot exclusion. Do not assert a verified fix from mocked tests. Existing binaries also retain their bundled code.

### Durable context awaiting version control

The operating instructions and project context are written but untracked. This is unfinished documentation integration, not broken product behavior. Review the three documentation files together before a later authorized commit, preserving the separate private-photo patch.

### Documented release gaps, not missing whole features

- StoreKit uses one monthly product. README-requested gender-specific prices need confirmed product routing and App Store Connect setup if still intended. Files: `iphone/src/billing.ts`, `iphone/ios/App/App/AppleMembershipPlugin.swift`, and `iphone/supabase/functions/_shared/apple.ts`.
- Native calls/APNs/Face ID and privacy behavior have explicit two-device acceptance steps in `iphone/docs/NATIVE_EXPERIENCE.md`. Latest results and installed build are unverified.
- Manual document collection is intentionally paused; readiness issuer verification is inactive. These require product/provider/legal decisions, not automatic implementation. See `iphone/docs/manual-verification.md` and `readiness-passport.md`.

## Technical issues and uncertainty

- Confirmed documentation drift: `iphone/README.md` still describes foreground-only calls, whereas native CallKit/PushKit implementation and newer documentation exist. Interview documentation also contains older limits; source uses prompt version 3. Treat old release records as dated evidence.
- All Profiles randomization is client-side over loaded results, with backend offsets of 24. It does not randomize the whole eligible population before fetching. Whether global exposure fairness is required needs clarification; no replacement backend was authorized.
- Visibility resume currently reshuffles whenever the document becomes visible. Verify behavior around open profiles, sheets, native system dialogs, filters, pagination, and scroll restoration. These are review targets, not reproduced bugs.
- Shared CSS has overlapping feature and global overrides. Verify representative screens after shared-style edits; preserve safe-area ownership and keyboard geometry.
- Earlier work reported passing targeted privacy tests/typecheck and a production styling build. Those results were not rerun in this review. The broader `chat-privacy-sources.test.mjs` previously failed to load a dependency in its test harness; reassess the current failure before treating it as an application defect.
- Live provider settings, CI results, deployed Git revision, current TestFlight build, and current profile/subscription state were not inspected. A repository push does not establish native delivery or database state.

## Product decisions to preserve or clarify

Preserve: serious Saudi marriage positioning; compact Arabic RTL iPhone presentation; shared burgundy/neutral design and real branding; application-state navigation in React DOM/Capacitor; explicit consent and server authorization; separate real/test/simulation data; complete versioned reciprocal compatibility evidence; Luna suggestions reviewed by the member before normal saving; mutually accepted communication and seriousness progression.

Clarify only where the next task requires it:

1. Is iPhone-only one-time viewing the accepted long-term browser behavior, and what native capture guarantees may the product claim after device testing?
2. Does randomized discovery mean reshuffling loaded profiles or fair random selection across all eligible members?
3. Are the documented distinct subscription prices still intended, and what products/providers are currently activated?

Previous-account conversations were not accessed. The current thread contains prior requests and reports, but they do not independently verify hosted state or completed device checks. No user-data identities, credentials, or raw transcripts are included here.

## Recommended next three development tasks

1. **Finish the pending one-time-photo privacy patch.** Highest priority because it changes access to sensitive content and is already in progress. Review the four modified files and native viewer together. Validate unsupported browser/platform/plugin states before consumption, authorized download failure, native cleanup, and no replay. Then verify screenshots on a current iPhone build before closing the native complaint.
2. **Verify and close the recent discovery/Relationships changes.** Focus on `iphone/src/community/Community.tsx`, `discoveryMemory.ts`, `MatchesOverview.tsx`, `iphone/src/compatibility/ScoreTile.tsx`, `iphone/src/arrivalSurfaces.css`, and `iphone/src/testing/pair.ts`. Check refresh/resume, loaded-page ordering, profile open/back, filters, presence, compact controls, RTL, and safe areas. Fix only reproduced regressions; confirm broader randomization expectations before changing server behavior.
3. **Complete an end-to-end release readiness pass.** Follow registration/social phone completion through onboarding/Luna confirmation, review, StoreKit entitlement, accepted chat, notifications, and calls. Relevant entry points are `iphone/src/auth/`, `App.tsx`, `src/interview/`, `api/_lib/interview.mjs`, `billing.ts`, native bridges, and `codemagic.yaml`. Use authorized sandbox/disposable accounts and establish provider/build state first. Resolve observed blockers before broad rollout; keep paused verification features paused.

## Safe resumption checks

Start with Git status/diff and target only the chosen task. For task 1, from `iphone/`, run `node --test tests/chat-private-media.test.mjs`, then `npm run typecheck`. Expand to the relevant media-service/database tests only for risks the patch touches. Use `npm run build` before release. Dependency-loading failures must be distinguished from failing behavioral assertions.

For task 2, use representative browser checks and Dynamic Island/notched iPhone checks rather than redesigning from source alone. For task 3, follow `iphone/ios/TESTFLIGHT.md` and `iphone/docs/NATIVE_EXPERIENCE.md`; server-side or purchase activation is a separate authorized operation. GitHub CI is defined in `.github/workflows/nisfayn.yml`; no current green status is assumed here.

Recommended next coding task: complete the four-file one-time-photo patch as one scoped change, including unsupported-plugin and post-consumption error validation, then obtain physical-device evidence for the separate native screenshot issue.
