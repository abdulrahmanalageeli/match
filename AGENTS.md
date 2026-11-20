# Wudayn development instructions

## Start here

Wudayn (وُدَين) is a production-intended Saudi marriage application for serious introductions, compatibility, and consent-based relationship progression. Read `docs/AI_PROJECT_CONTEXT.md` for the project map, decisions, and known gaps. Read only the feature documentation relevant to the task afterward.

Before editing, check `git status --short` and inspect the relevant implementation and any nested instructions. Existing uncommitted work may belong to another task. Preserve it and stage only authorized changes. Do not infer deployed behavior from repository code or historical release notes.

## Architecture and boundaries

- `iphone/` is the Wudayn member application: React 19, TypeScript, Vite, React DOM, and CSS inside Capacitor 8 for iOS. Navigation uses application state in `src/App.tsx` and `src/community/Community.tsx`. It is not an Expo Router or SwiftUI application. React Native Web/Reanimated and Skia support animation/artwork through Vite web aliases.
- Root `app/`, `components/`, `server/`, `database/`, and root package configuration belong to the separate BlindMatch event application. Do not confuse its backend, migrations, or build commands with Wudayn.
- `iphone/src/` holds member UI and client adapters. `src/community/data.ts` defines the community contract and real/demo adapters; `src/testing/pair.ts` implements the isolated private tester adapter.
- `iphone/api/` holds server-side AI endpoints. `iphone/admin/` is a separate React/Vite staff app plus trusted API/worker code. `iphone/ios/App/` contains the native Xcode app and Swift bridges. `iphone/service/` is an optional legacy SQLite development service.
- `iphone/supabase/` contains Wudayn migrations, Edge Functions, and database tests. The dedicated marriage project is `wupkifqbwhhebwrgvwai`; root/event Supabase data is separate. Check the actual target before any hosted operation. Staging requires explicit configuration; consult `src/deployment.ts`.

## Product and implementation principles

Preserve Wudayn's premium, serious marriage identity: polished iPhone interactions, excellent Arabic RTL, natural Saudi-appropriate copy, accessible controls, deliberate motion, and minimal onboarding friction. Follow existing burgundy/rose/neutral styling and real brand assets. Reuse components instead of introducing generic replacements or redesigning working screens without authorization.

For every Wudayn UI/UX/GUI task, also follow `iphone/AGENTS.md`: its mandatory adaptive creative freedom policy and visual QA requirements apply alongside these instructions, including Wudayn UI work outside `iphone/`.

- Styling starts with `src/design.css` tokens. Shared refinements are in `src/arrivalSurfaces.css` and `src/typography.css`; feature CSS also applies. Inspect specificity and import order before adding overrides. Keep text inputs readable and honor reduced-motion settings.
- Safe areas combine CSS environment values and native insets reported by `MarriageBridgeController.swift`. Keyboard behavior uses `src/mobile/keyboardViewport.ts` and chat viewport handling. Preserve inset ownership, RTL, scrolling, and tab navigation; avoid duplicate or device-specific padding.
- Supabase Auth sessions and server-authorized RPCs establish identity and access. Apple/Google login uses `src/auth/social.ts` and native bridges; social onboarding includes explicit consent and phone verification. Face ID/device authentication protects local app access; it is not identity verification.
- Keep matching deterministic and versioned. `src/compatibility/model.ts` and catalogs govern reciprocal preferences, priorities, requirements, and completeness. `src/beena/` adds scenarios. Do not invent scores or call them marriage-success probabilities. Preserve SQL/client scoring parity and legacy data compatibility.
- Luna's guided interview spans `src/interview/`, `api/interview.mjs`, and `api/_lib/interview.mjs`. It proposes evidence-backed answers for explicit member review. Preserve consent, ownership, revision/idempotency checks, quotas, and normal profile-save boundaries. Avoid unnecessary AI calls; never substitute model output for authorization or deterministic scoring.

## Security and privacy

Never read `.env` files, session stores, private keys, or other credential material unless necessary and authorized. Never print credentials or copy them into documentation. Do not place service credentials in browser code. Native/server-only integrations must stay behind their existing boundaries.

Preserve RLS, live-session checks, private Storage, mutual-acceptance gates, blocks/reports, consent and retention rules. Client visibility is not authorization. Keep real members, fictional simulation, and private tester identities isolated. Avoid supplying other members' chats, photos, or secrets to AI. Do not promise screenshot prevention or verified identity beyond the implementation's actual evidence.

Document collection is deliberately paused; readiness issuer verification is not activated. Do not enable experimental, restricted, or planned features merely because code exists. See the context document and feature docs.

## Wudayn demo roster and private testing

- Keep the 10 fictional men and 10 fictional women in `iphone/src/community/data.ts` aligned with the server persona briefs in `iphone/src/community/demoPersonas.json`. Stable IDs preserve saved demo chats. Supply valid answers for both the current and legacy assessment catalogs. Portraits and their provenance are in `iphone/public/demo/portraits/`. Use fictional adult Saudi portraits and retain the existing avatar and initial fallbacks.
- The standalone demo seeds one accepted match and one incoming request for each pool. The paired tester flow uses the existing simulator and shared match limits. Abdulrahman’s fictional directory uses a complete test scenario when his own assessment or matching basics are incomplete. This fallback stays in memory and never affects his saved answers or the real tester pair score. Keep unlabeled profile presentation within the existing interactive demo and private test flows. Read-only fixtures retain their labels. Preserve the server authorization for AI replies and keep simulated activity separate from live member accounts.
- From `iphone/`, run `npm run typecheck` and the focused checks below. The AI provider is mocked in these tests. Verify visual presentation and live replies separately when required.

```sh
node --experimental-strip-types --experimental-vm-modules --test src/community/demoPeople.test.mjs src/community/simulation.test.mjs src/testing/pair-simulation.test.mjs tests/ai-api.test.mjs tests/testing-discovery.test.mjs
```

## Efficient work and validation

- Read relevant files, then make the smallest correct change. Reuse existing patterns; avoid unrelated edits, broad rewrites, unnecessary dependencies, speculative abstractions, and repeated full-repository scans.
- Do not launch subagents by default. Delegate only when the task genuinely benefits from independent parallel work and applicable session instructions permit it.
- Do not run destructive commands, migrations, or infrastructure changes without explicit authorization. A code fix does not imply permission to modify production data. Verify authorized data changes with a scoped read afterward.
- Begin with the smallest relevant tests. Do not run the entire suite for a trivial copy/style change. Never claim device/live verification from a build or mocked test. Explain meaningful trade-offs and remaining gaps concisely.
- Wudayn commands run from `iphone/`: `npm run dev`, `npm run typecheck`, `npm run build`, `npm run build:demo`, `npm run test:unit`. Use Node 22 as specified by package configuration. Many targeted Node tests require `--experimental-strip-types`; some also require `--experimental-vm-modules`.
- Admin: run `npm test` / `npm run build` from `iphone/admin/`. Database verification: run `npm test` from `iphone/supabase/tests/` (PGlite). Use installed locked dependencies; do not install packages simply to inspect the project.
- Before delivery, inspect `git diff --check` and the changed-file list. Check `.github/workflows/nisfayn.yml` for CI scope. Native builds require macOS/Xcode; `npm run ios:sync` builds and syncs Capacitor assets. `codemagic.yaml` defines manual signed iPhone builds. A Git push or web deployment does not update an installed TestFlight bundle.

Keep this file durable and concise. Put architecture detail and dated development context in `docs/AI_PROJECT_CONTEXT.md`, feature details in existing feature docs, and temporary task state in the task report. Never persist credentials or conversation transcripts here.
