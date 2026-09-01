# Event3 ranking completion

Leaving `ranking1`, `ranking2`, or the choice-only edition's `ranking3` finalizes every enrolled participant's ballot in
the same database transaction as the phase update. It uses the latest synced
unfinished order for that round. Without a valid draft, it preserves saved
choices and appends missing tablemates in first-meeting round / participant-number
order. Repeat tablemates appear once; the required count is not fixed at 11.

Timer expiry and the organizer's recovery button use the same completion
function. Submissions, drafts, and phase changes lock the event-state row, and
late requests acknowledge the finalized ballot rather than changing it after
matching starts. Any database failure rolls back the phase update and ballots.
Resetting to setup does not finalize rankings. Drafts are isolated by event,
round, and test session and are accessible only through the server role.

The participant screen syncs unfinished ordering changes and retries temporary
failures. A phone that is offline cannot transmit its unsynced changes: phase
exit uses the last successfully synced order, or the saved ballot plus missing
people. The screen displays whether its draft has synced.

## Rollout

1. Apply `supabase/migrations/20260830085709_complete_event3_rankings_on_phase_exit.sql`.
2. Apply `supabase/migrations/20260901104855_add_event3_choice_only_three_groups.sql`
   before enabling the three-round event format.
3. Deploy the updated participant and admin APIs and screens together.
4. Verify a test event with first-round-only ballots, then advance from the
   final ranking screen before its timer ends. Confirm every ballot includes
   the participant's actual tablemates.

The migration does not update historical rankings. Do not deploy the new API
before the migration, since it calls the new database functions.

## Verification

Run `node --test server/event3/ranking-persistence.test.mjs`. The suite executes
the actual migration in an isolated PGlite PostgreSQL database using synthetic
seating and participants; it never connects to Supabase. It covers incomplete
ballots, unfinished drafts, early phase advancement, timer completion, variable
tablemate counts, stale requests, retries, transaction rollback, organizer
corrections, test-session isolation, and database permissions.
