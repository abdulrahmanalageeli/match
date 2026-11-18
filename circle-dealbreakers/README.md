# THE CIRCLE — presentation and anonymous dealbreakers

Event: **الحدود والديل بريكرز · 7 October 2026**.

- Participants: https://blindmatch.app/circle/
- Presentation: https://blindmatch.app/circle/presenter.html
- Private host list: https://blindmatch.app/circle/host.html
- Anonymous report: https://blindmatch.app/circle/report.html

Guests scan the QR and submit a dealbreaker in a popup. No name, account, or login is required. Closing the popup returns to the page; they can contribute again later. The submission request omits cookies and sends no identity fields.

The presentation uses the original 51 slide images. Scenario slides have a local three-minute timer. There is no live voting, name display, or participant count. Navigate with arrow keys; Space pauses, R restarts, T adds 30 seconds, and F opens fullscreen. The QR and anonymous-list dialogs pause the timer while open and resume it on return.

The host can view the anonymous list privately, or click **الديل بريكرز المكتوبة** in the presentation to show it on screen. Sign in on the host page in the same browser to authorize viewing submissions. The presentation itself can be opened without signing in. The report contains anonymous text only and supports a self-contained HTML download and Print / Save as PDF.

The private host code is stored locally in `.env.host` and `HOST_ACCESS.private.txt`. Never copy it into public assets, Git, a QR, or a shared report.

## Implementation

Static assets are published under `/circle/` in the existing Blindmatch Vercel project. The existing app is preserved. The API rewrites use the connected Supabase project `xytwdgiihfmxiflwuxti`.

`supabase/index.ts` handles anonymous submissions. The table contains only `id`, `text`, and `created_at`; no participant relationship exists. The protected host endpoint in `supabase/event.ts` provides the host login and submission list. All Circle tables use RLS and deny direct anonymous/authenticated reads. Supabase's service credential is server-only.

Previous voting storage remains private and is not deleted by this UI simplification. The current presentation and guest page do not submit votes or register participants.
