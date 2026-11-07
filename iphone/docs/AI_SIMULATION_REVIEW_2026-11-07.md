# AI and simulation review — 7 November 2026

## Privacy amendment — pending deployment

The amendment below supersedes the earlier behavior recorded in this historical release review. It is a source change, not evidence of a deployed change.

- Conversation starters now accept only `{ "mode": "opener" }`. OpenAI receives static generic instructions, with no member biography, interests, identity, assessment answers or message text. Existing clients that submit a profile are rejected before authentication or provider calls.
- The `demo_reply` server mode is disabled for all accounts pending processor and international-transfer review. Tester simulation uses its existing local Arabic replies, and the panel/log identifies them as local demonstrations.
- If generic generation is unavailable, the client returns a local generic starter. The button describes a suggestion without claiming every result is AI-generated.
- Provider calls retain `store: false`; that is not a claim of zero retention or regulatory compliance. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
- Authentication and usage quotas still run through the existing checked application RPC. Account tokens are never included in provider prompts.

## Earlier deployed behavior (historical)

Status: deployed to https://nisfayn-preview.vercel.app on 7 November 2026. Live API and mobile browser checks passed. This verifies the scoped demo flows below; it does not establish readiness for a public production launch.

## What is available

- 30 fictional profiles: 15 men and 15 women, with varied biographies, ages, work, interests, family expectations, marriage timelines, and meeting preferences. Some have illustrative photos; others use an avatar or no picture.
- Each profile has complete answers to the existing 32-question preference assessment and 12-question personality assessment. Coverage represents the app's measured behavioral traits, not MBTI. No 16-type classification is claimed or assigned to real people.
- Open **the arrow at the top → محاكاة الاستخدام** in the private tester experience. **تشغيل المحاكاة**, **إيقاف مؤقت**, **خطوة واحدة**, and **إعادة المحاكاة** control activity; **سجل النشاط** explains what happened.
- Up to five profiles from the currently ranked pool participate automatically. Other fictional profiles remain available for ordinary manual testing. Activity starts only when requested, runs at roughly 12–24-second intervals while the page is visible, and stops at 60 events until reset.
- Eligible demo conversations use server-side OpenAI replies with a bounded recent transcript. The panel discloses this use. A local Arabic reply is used if generation is unavailable; the activity log distinguishes AI replies from local replies.

## Isolation and persistence

Simulation requests, text conversations, notifications, blocks, read positions, and stages are saved in browser storage scoped to the tester identity and gender pool. Refresh restores those fixtures with automatic activity paused. Reset affects these local fixtures.

The Abdulrahman–Reham conversation remains a separate shared server-backed test pair. Its messages are not supplied to the simulation, and simulated actions never impersonate either tester or act against real members. The real pair still counts toward the limit of two concurrent accepted connections; exclusivity prevents fictional activity.

## Scenarios and gaps addressed

| Scenario | Behavior or correction |
| --- | --- |
| A visitor browses and expresses interest | Profile-visit and interest notifications now exist in the demo source, merge into tester notifications, and can be marked read. |
| A request is accepted or declined | Active participants produce both outcomes. Accepted matches get a celebration key; acknowledging a local celebration stays local. |
| A tester sends a message | The peer reads before replying. Read receipts, unread totals, and local conversation previews update. Pair unread totals include fictional conversations. |
| A tester refreshes | Requests, text history, read positions, and celebration acknowledgments survive within the same browser scope. |
| A tester blocks, reports, or unmatches | Blocking records the peer identity. Late AI responses are discarded after blocking, unmatching, pausing, resetting, or entering exclusivity. |
| The real pair becomes exclusive | Local conversations are retired again whenever exclusivity applies; an old retirement flag no longer skips newly restored fixtures. |
| The real pair already occupies a slot | Simulated acceptance and manual dummy acceptance count that slot and respect the shared two-connection limit. |

## Evidence and remaining work

The full app suite passed **205/205**, including simulation and mixed tester-source regressions. The AI API suite passed **10/10**, and its database integration test passed. TypeScript and the deployed build passed. Meaningful checks cover participant limits, bounded activity, start/pause behavior, accepts and declines, capacity, exclusivity, delayed-response cancellation, refresh persistence, identity isolation, and unread/read transitions.

Live verification confirmed:

- Unauthenticated AI requests were rejected; a synthetic opener and fictional reply both returned `source: openai`.
- The tester drawer produced a visit, presence change, interest notification, and incoming fictional request. Acceptance displayed the match animation.
- An AI opener was reviewed, inserted as a draft, and sent only to fictional Fahd. The next simulation steps marked it read and produced a contextual OpenAI reply. The log distinguished the generated reply.
- Start and pause worked. Reload preserved the request, two-message text thread, read receipt, and six activity events with simulation paused. The existing Abdulrahman–Reham conversation was not edited.
- Mobile inspection found and corrected overlapping test controls; the drawer now has its own bounded scrollable surface. Screenshots are in `artifacts/ai-simulation-controls.jpg` and `artifacts/ai-simulation-chat.jpg`.
- Native API preflight returned 204 for `capacitor://localhost` with the allowed headers. This is not a physical-device test.

OpenAI uses the explicitly approved existing BlindMatch key in server-only Vercel settings. The temporary transfer file was removed. The database grants only a narrow session-checked rate-limit RPC; it does not expose usage rows or require a service-role credential. Limits are six generations per minute, 80 per tester actor/day, 20 per member/day, and 300 total/day. Short-lived generated text caching is server memory only; database records contain counters, not prompts or transcripts.

Remaining limits:

- Simulated activity is local to one browser, not a shared background service or a cross-device user population.
- Media blobs and demo readiness/family fixture state remain session-local. Simulation persistence does not cover them.
- Activity while the page is closed, actual push delivery, native phone behavior, and real network conditions require separate verification.
- Behavioral variation is deliberate and bounded for reproducible testing. It is not evidence that the app has real active members or that personality predictions are scientifically validated.

Continue exploratory testing with the top arrow → محاكاة الاستخدام. Choose Start for paced activity or Step for repeatable actions. The live checks above used only the tester's local fictional state and synthetic AI inputs.
