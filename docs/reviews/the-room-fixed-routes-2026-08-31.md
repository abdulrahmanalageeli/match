# The Room: arrival-based fixed routes

New events start with zero attendees. Organizers choose the actual physical table count (default five) and round count (default three). Every table reserves two places for men and two for women in each round. The existing 30-minute timer can run before the first arrival and is unaffected by check-in.

## Reception behavior

- Each arriving guest gets a numbered identity and a complete route from the current round through the last round. Their route is committed before their photo card appears.
- Existing table numbers and issued routes never change when another guest arrives. Configuration locks after a route is issued or the event advances beyond round one.
- Current-round seating prefers occupied eligible tables, then fewer people of the arriving gender, then the earlier table number. This reproduces the requested M/M/M/W/M/M/W sequence: tables 1/1/2/1/2/3/2.
- Future-round routes use deterministic bounded search to minimize repeat encounters. If the selected route includes repeats, it is issued automatically without an override or extra approval. Repeats never reject or waitlist an arrival; reception explains the fallback and cards show a notice. Capacity remains strict.
- If any remaining round lacks an eligible place, the person is checked in on the waiting list without any partial route or card. Retrying seating reuses that person's identity.
- A lost check-in response retains its request ID in the browser session. Retrying retrieves the same guest rather than creating another one.
- Existing planned-roster events remain unchanged. They are not silently emptied or converted.

## Data guarantees

Three service-only, security-invoker RPCs create an empty event, configure it before routes are issued, and commit an arrival. Event locking plus route-revision/current-round checks serialize reception changes. Database triggers enforce complete routes, table/gender capacity, immutable issued seats, and consistent event/schedule dimensions. Repeat metrics are derived from committed rows.

Fixed-route bundle reads paginate attendees and seats and validate the final revision, preventing truncated or mixed snapshots during concurrent arrivals. Explicit deletion of an entire event remains atomic; individual issued routes cannot be deleted or regenerated. Deferring the attendee-seat foreign-key check allows valid event cascades while preserving referential integrity at commit.

## Verification

- All 92 Room tests pass: planner, PostgreSQL/PGlite migrations and permissions, actual API handler, concurrency, idempotency, mixed snapshot recovery, over-1,000-seat pagination, timer/round changes, photo-route preservation, waiting list, and legacy regressions. Repeat-fallback cases include filling a single table for twenty rounds and admitting a guest mid-event despite repeated companions; neither needs an override.
- Production build passes with the bundled supported Node runtime.
- Desktop and 390-pixel mobile preview checked in the browser: empty setup, timer while checking in, hard capacity, waiting-list retry, admission of the other gender, repeat warnings, fixed settings, event switching, and reopening the original unchanged card. No browser errors observed.
- Full repository TypeScript checking still has unrelated existing errors; no errors in Room files.

## Rollout

Local changes only; no production data was modified and no deployment was performed. Apply these pending migrations in order before deploying the matching API/frontend:

1. `20260831123042_the_room_atomic_setup.sql`
2. `20260831124115_the_room_round_timer.sql`
3. `20260831131002_the_room_fixed_routes.sql`

New events use the empty fixed-route flow. Existing events retain their previous seating mode and issued plans.
