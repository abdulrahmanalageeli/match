# THE CIRCLE — live event

Event: **الحدود والديل بريكرز · 7 October 2026**.

- Participants: https://blindmatch.app/circle/
- Host: https://blindmatch.app/circle/host.html
- Projector: https://blindmatch.app/circle/presenter.html
- Private report: https://blindmatch.app/circle/report.html
- Anonymous submissions: https://blindmatch.app/circle/anonymous.html

The private host code is in `.env.host` on the organizer's machine. It must never be copied into `public/`, Git, a QR code, or a shared report. Log in on the host page first, then open the projector in the same browser.

## Running the event

1. Open the projector and choose **انضم للدائرة** to display the join QR code.
2. Guests enter a display name once and save their personal recovery code. An HttpOnly cookie keeps the same identity for 30 days. Returning guests can also use their code from another device.
3. Navigate the deck with the arrow keys. Voting starts for 3 minutes on each of the 23 choice-based scenarios. The three open discussion cards remain discussion prompts.
4. Names animate into their selected answer. The host can hide/reveal names without stopping voting, close/reopen a vote, and add/remove participants or reset their personal code.
5. Keyboard: **Space** pause/resume, **R** restart, **T** add 30 seconds, **F** fullscreen.
6. Open the report at the end. Download the self-contained HTML report or use **طباعة / حفظ PDF** and select **Save as PDF**. Reports include every participant's latest answer to each scenario, summaries, and a separate anonymous submission list.

Voting names are visible in the room and in the organizer's private report. This is explained before joining. Free-text dealbreakers use a separate endpoint and table with no participant ID, name, cookie, or session linkage.

## Implementation

The static frontend in `public/` is published at `/circle/` inside the existing Blindmatch Vercel project. The existing app is preserved. Two same-origin rewrites forward `/api/circle-event` and `/api/circle-dealbreakers` to the corresponding Supabase Edge Functions.

- Supabase project: `xytwdgiihfmxiflwuxti`
- Event ID: `the-circle-2026-10-07`
- `event-schema.sql`: event state, participants, hashed sessions/recovery codes, final votes, rate limits, protected RPCs.
- `database.sql`: independent anonymous submissions table.
- `supabase/event.ts`: named voting, host actions, private reports.
- `supabase/index.ts`: anonymous submission endpoint.
- `public/slides.json`: all 51 approved slides and their stable identifiers.

All new tables use RLS and deny direct `anon`/`authenticated` access. Edge Functions retain JWT verification and use a public anon gateway key; privileged credentials come only from Supabase's built-in server environment. Host and participant authorization is checked separately using random, hashed session tokens in Secure HttpOnly SameSite cookies.

The report stores the **latest selection per participant per scenario**; changing a vote updates it. Removing a participant revokes sessions and hides their names from live results while preserving their existing report history.

No secrets or production environment files belong in this directory's public assets or deployment commit.
