# The Room round timer — 2026-08-31

Added an event-scoped shared timer to reception, management, and the projector.

- Defaults to thirty minutes for existing and new events; organizers can set 1–120 minutes while stopped. The duration carries forward to later rounds.
- Start, pause, resume, and reset controls. Reset asks for confirmation if time remains.
- Running timers store a database deadline; paused timers store remaining seconds. Refreshing does not restart a real event timer. Clients compensate for device clock differences using server response time and render locally between the existing five-second event polls.
- Expiry displays `00:00` and an Arabic end-of-round message without advancing the event. The host controls the next round.
- Advancing a round resets its countdown atomically, ready to start. Full regeneration resets it too; walk-ins, roster extensions, and manual seating moves preserve it.
- Timer commands check both round and timer revision under the event lock. Stale commands return a conflict instead of changing another organizer's timer. The RPC remains restricted to `service_role` and the API requires the existing Room session.
- The projector follows the active round by default. Browsing another round hides the live timer and offers an explicit return-to-live control.
- When event synchronization fails, the countdown is labelled as the last synced state and timer controls are disabled until synchronization recovers.

Validation: 54 Room tests pass, including deadline arithmetic, expiry, pause/resume, duration bounds, stale-device commands, round changes, schedule regeneration, seating changes, and database permissions. Desktop and 390px mobile browser checks verified the controls, projector preview, next-round reset, and actual countdown expiry. Browser testing used the disposable local preview; live persistence and concurrency behavior were exercised with local PostgreSQL/PGlite fixtures. Production build passes. Existing project-wide TypeScript errors remain outside the Room files.

Deployment: apply `20260831123042_the_room_atomic_setup.sql`, then `20260831124115_the_room_round_timer.sql`, before deploying the API/frontend. Neither migration nor these application changes have been deployed to production from this task. The local preview timer is intentionally in-memory; real event timers are persisted in the database.
