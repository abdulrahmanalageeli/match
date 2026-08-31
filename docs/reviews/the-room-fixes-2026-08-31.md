# The Room fixes — 2026-08-31

All three issues from the review are addressed in the local code.

- **Manual moves survive concurrent walk-ins.** Moves now publish a new schedule run through `replace_the_room_schedule_if_current`, with the expected run ID and active round. A stale operation returns HTTP 409 with `EVENT_CHANGED_RETRY`; it cannot silently replace the newer seating. Move metrics are recalculated.
- **Failed settings changes preserve the working event.** `prepareTheRoomSetup` computes the proposed roster and schedule without database writes. `save_the_room_setup_if_current` commits the new guests, settings, active round, and schedule in one transaction, checking the original event timestamp, active round, and schedule ID. Validation or persistence failure rolls everything back. Event reads no longer create guests or invalidate schedules.
- **Adding planned guests preserves the live round.** The UI keeps the server round installed by the response. It does not call a second full regeneration after a successful settings save. Intentional dimension changes regenerate and restart at round one in the same database transaction.

Validation:

- `node --test --test-reporter=spec server/the-room/*.test.mjs`: 47 passing tests.
- Nine new regression tests execute the API handler against local PGlite/PostgreSQL functions and exercise the actual UI save callback. They cover invalid configurations, rollback before and after schedule retirement, late-round extensions, successful dimension changes, both orders of the manual-move/walk-in race, stale setup writes, and database role permissions.
- API JavaScript syntax and `git diff --check` pass.
- Production client and server build passes with bundled Node v24.19.0. Vite reports existing shared-UI sourcemap and chunk warnings.
- Project-wide TypeScript checking reports 44 existing errors outside The Room; no diagnostics name `the-room`.
- These checks use synthetic local events; no live event data was modified. Browser verification was not performed.

Deployment order: apply `supabase/migrations/20260831123042_the_room_atomic_setup.sql` before deploying the updated API and frontend. The migration is additive and grants the new RPC only to `service_role`. It has been exercised locally but has not been applied to the live database.
