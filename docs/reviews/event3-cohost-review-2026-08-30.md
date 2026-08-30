# Event3 and cohost review — 30 August 2026

**Follow-up:** the six confirmed findings below have been addressed. See [the incident and fix verification](event3-admin-fixes-2026-08-30.md). This document preserves the original reproductions; its temporary workarounds describe the version before those fixes. The shared attention queue and before-advance checklist remain optional additions, not completed features.

Reviewed the participant experience and the cohost's ability to monitor attendance, rankings, feedback, and support while the primary host runs the event. The initial review changed no production records, event phases, messages, or deployments.

## Coverage and limits

- All **252 existing server tests passed**, including 17 ranking-persistence tests that execute the migration SQL in PGlite. These cover completing six-person ballots when leaving ranking two, preserving pending orders, all-participant completion, retries, rollback, historical/test isolation, and organizer corrections.
- Exercised the actual Event3 Phase3 component and actual cohost page in a local browser with synthetic API responses: arrival, session entry, early feedback, login, attendance, support reply, delayed dashboard responses, feedback failures, host lock, and reopening.
- Executed isolated probes against the actual rate-limiter function, notification visibility logic, results response builder, and both host/cohost support-reply handlers. Database writes in these probes used an in-memory adapter; no live attendee data was used.
- Read-only production runtime-error inspection returned the existing `DEP0169 url.parse()` deprecation-warning group. That is not evidence of an application crash.
- This was not a live event rehearsal or venue load test. Mobile hardware, background-tab behavior across devices, real SMS, production login credentials, and real message delivery were not exhaustively tested. Existing tests include source-boundary checks as well as execution tests; a green suite does not cover every browser workflow.

## Confirmed findings

### 1. Privacy exposure remains — high priority

The response builder includes a partner's phone, yes/no choice, and private organizer impression even when `mutual_match` is false. An isolated execution using entirely synthetic values returned all three. The feedback screen promises that the answer stays confidential unless the other person also agrees. On-screen hiding does not remove fields already delivered to the browser.

This is the previously identified exposure, not a regression introduced by the ranking fix. The code test confirms the response-building behavior; it does not establish whether anybody has accessed another person's details.

Fix: enforce mutual-consent disclosure on the server, and never return private organizer notes to the other participant.

Sources: `api/participant.mjs:2154`, `:2167`, `:2193`, `:2229`, `:2268`; promise at `app/routes/event3.tsx:4229`.

### 2. Shared venue Wi-Fi can cause request rejections — high priority

The participant API allows 120 requests per minute per public IP, per warm server instance. Each signed-in participant's heartbeat runs every five seconds. A probe with 11 distinct synthetic participant tokens sharing one IP made 132 heartbeat requests: **120 allowed, 12 rejected**. Phase3 adds another five-second poll, before saves or support requests.

Actual production impact depends on network sharing and Vercel instance distribution; this is a demonstrated limiter behavior, not a measured production incident. Cellular connections may not share the same bucket, but a venue router or hotspot can.

Fix: use an authenticated per-participant limit plus an appropriately sized abuse-protection limit per IP. Keep login/OTP limits separate. Rehearse on the venue's actual connection.

Sources: `api/participant.mjs:305`, `server/security/request-security.mjs:89`, `app/routes/event3.tsx:6894`, `:5023`.

### 3. Early Phase3 feedback closes itself

Browser reproduction: confirm arrival during an active algorithm meeting, choose “إنهاء اللقاء والبدء بالتقييم”, and wait for the next reveal poll. The feedback dialog opens, then disappears and the session returns. The auto-rejoin effect runs for each new response object and resets the view to `session` while time remains. Feedback answers live inside the unmounted dialog, so unfinished answers are lost.

Fix: limit auto-rejoin to initialization or an actual meeting change; preserve feedback state through ordinary polling. Until fixed, let the meeting timer expire before asking people to enter that feedback.

Sources: `app/routes/event3.tsx:5056`, `:5060`, `:5331`, `:3911`.

### 4. Cohost data can be stale without a useful warning

Two isolated browser cases confirmed:

- With every dashboard response delayed seven seconds, the six-second poll starts a newer request before the previous one finishes. Successful responses are discarded as outdated. After several completed responses, the page still showed the original participant data and no connection warning. Restoring fast responses recovered the display.
- When only individual-feedback requests fail, successful group-feedback requests keep updating the shared “last updated” timestamp. Quiet failures produce no visible alert, so the displayed individual-feedback counts can appear current when they are not.

Fix: prevent overlapping polls, add request timeouts, and track last successful update/error separately for each data section. Show an explicit stale warning after a bounded interval. Do not infer that an attendee failed to submit solely from a dashboard count during an outage.

Sources: `app/routes/admin-cohost.tsx:568`, `:572`, `:609`, `:622`, `:623`, `:653`.

### 5. Support needs shared context and safe concurrent replies

The cohost support card displays only the latest participant message and latest organizer reply. In the browser fixture, the first message explained that the partner had not arrived at table 4, but the cohost only saw “هل وصل أحد؟”. The dashboard API does not select the full chat history. For individual meetings, the participant request's location is only “كشف المرحلة 2/3”, without the actual table number.

A separate deterministic concurrency probe ran the real primary-host and cohost reply handlers against the same request. Both returned HTTP 200, but only one of their two replies remained in `chat_history`: both read the same earlier array and overwrote it. The participant-message handler uses the same read/replace pattern.

Fix: atomically append messages (or store each message as a separate row), display the complete conversation, and attach the current table/partner. A shared “I'm handling this” indicator would prevent duplicate work.

Sources: `api/admin/index.mjs:9143`, `:9471`, `:11101`; `api/participant.mjs:4166`, `:4180`; `app/routes/admin-cohost.tsx:1695`.

### 6. Ordinary notifications cannot serve as urgent meeting alerts

The actual visibility logic permits ordinary notifications during setup, processing, and break. It suppresses them during both group rounds, both rankings, both individual meetings, and final reveal. The isolated phase matrix confirmed this even with a pending notification and no competing dialog or mood prompt.

This is an operational limitation of the current interruption policy. A successful send is not proof that the attendee has seen the message. For example, “please move to table 4” may wait until a later permitted phase.

Improvement: distinguish ordinary queued messages from urgent organizer alerts, show their delivery state clearly, and provide acknowledgement for urgent instructions. Until then, use in-person announcements for immediate changes.

Source: `app/routes/event3.tsx:7198`–`:7207`.

## Useful additions for the host and cohost

1. **Shared “needs attention” queue:** missing arrival, help requests, incomplete rankings, and missing feedback, with participant/table shortcuts and a named organizer handling each item. Reuse the existing attendance, ranking, feedback, and notes data rather than adding another disconnected dashboard.
2. **Before-advance checklist:** show complete rankings, pending feedback, unseated participants, and unresolved support. Separate hard blockers from warnings so the main host can make an informed decision without taking phase controls away from the host.
3. **Urgent acknowledged alert:** an explicit urgent option with delivery/seen/acknowledged states, alongside the existing noninterrupting notifications.

The existing cohost separation is useful: phase, timer, and matching controls stay with the main host. Preserve that boundary while improving shared visibility.
