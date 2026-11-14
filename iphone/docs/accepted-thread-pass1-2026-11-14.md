# Accepted conversation polish — pass 1 (2026-11-14)

Base: paid-value pass 6, `161c5e18`.

Changes: preserve input focus on send; keep the message lane visible by collapsing the context rail while the keyboard is detected; restore 44px photo, voice, send, header, context, and message-menu close targets; show the latest message receipt in text; add a short optimistic-send entrance that respects both reduced-motion preferences; tighten the 320px header.

Verification uses the actual Chat, media composer/player, message focus/reactions, agreement, and call permission components. The entry button and CommunitySource are local fixtures. The fixture imports the production style layers, supplies an accepted agreement, delays sends and receipt transitions, and stores only synthetic messages locally. Browser routing rejects every external request. Tests are excluded from hosted builds.

Run from iphone: `node tests/accepted-thread.browser.mjs`. Set `NISFAYN_PLAYWRIGHT_MODULE` if Playwright is installed at a different path. Screenshots go to `.tmp/accepted-thread/`.

Coverage: 390x844 and 320x667; accepted fixture entry; text with optimistic state and focus retention; sent/delivered/read; pointer hold, reaction, reply, confirmed deletion; photo selection/upload; fake-device microphone recording, preview, send and playback; call permission invite/pending; simulated reduced viewport keyboard; OS and app reduced motion; no horizontal overflow, browser errors, or external requests.

Targeted tests: 29 passing across chat actions, viewport, reading/typing, private media and swipe/reply. Corrected the gesture test's stale lucide import stub to use the existing BrandIcons import. Typecheck and production build pass (existing large-chunk/externalized-module warnings).

Limits: fixture evidence is not live accepted-chat verification. No tester was unpaused and no relationship, assessment, pricing, matching, or BlindMatch data was changed. The entry button is a harness rather than live mutual-match navigation. Keyboard geometry is Chromium simulation, not a physical iPhone/Safari keyboard. Microphone input is synthetic; actual two-device delivery, media storage, native audio routing, and connected calls remain unverified. Call coverage ends at permission request/pending, not a connected call.
