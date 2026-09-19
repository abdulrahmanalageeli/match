# Six-round mutual choice

Event format: `mutual_choice_six_rounds`. Classic and three-group choice editions keep their existing flow.

## Participant flow

- Six timed sessions total. Groups and one-to-ones use the same duration and server deadline.
- Round one starts in groups. During a group session, each participant can privately choose one tablemate or explicitly choose nobody. Choices can be changed until the deadline; no response is treated as no choice.
- Only two reciprocal choices from the same group create a one-to-one in the following session. A one-to-one lasts one session; both people return to the group pool after it.
- Everyone else is regrouped, balancing group sizes and gender distribution while minimizing repeated introductions.
- If fewer than three people remain in the group pool, they receive a private break until the next session. The system never converts this remainder into an unchosen one-to-one.
- Round six has no further selection, since there is no seventh session.
- Participants see their own destination, their current companions and their own saved choice. Incoming selections and other tables' outcomes are never returned to them.

## Host flow

New editions default to this format. The main admin event selector also allows classic or three-group choice when creating an edition; revisiting an existing edition preserves its saved format. Event 29 uses mutual choice, and the automatic default starts with event 30.

Choose or change the format during setup, select the roster and set one session duration. Start the event from its dedicated six-round control panel. Pause and resume preserve the shared time remaining. Reset clears the runtime so a new run can be started. The cohost dashboard shows the current rooms without exposing private choices. Test mode uses a separate run and can be started or ended from the Event3 admin page.

The runtime advances atomically when an authenticated client polls after the shared deadline. All polling clients receive the same committed next round. If every client is offline, the next session begins when polling resumes rather than skipping sessions that nobody attended.

## Release

Apply `supabase/migrations/20260919061904_event3_mutual_choice_six_rounds.sql` and `supabase/migrations/20260919070805_event3_mutual_default_for_new_events.sql` before deploying the application. They add the format, private runtime storage/RPCs, and the default for new editions. The default migration captures the next unused event number so historical editions remain unchanged. Event 29 is explicitly activated after the application deployment.

Focused verification: `node --test server/event3/mutual-*.test.mjs server/event3/new-event-default.test.mjs`, plus the application build and mobile checks for group, pair, break and completion states.

The participant route includes local development previews using `?questionPreview=mutualGroup`, `mutualPair`, `mutualPaused`, `mutualBreak`, `mutualFinal`, `mutualComplete`, `mutualSetup`, and `mutualWelcome`. These use synthetic data.
