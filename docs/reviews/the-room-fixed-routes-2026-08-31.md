# The Room: arrival-based fixed routes

New events start with zero attendees and no estimated guest limit. Organizers choose the actual physical table count (default five) and round count (default three). Four people per table and two per gender are preferences, not admission limits. Tables grow as people arrive. The existing 30-minute timer can run before the first arrival and is unaffected by check-in.

## Reception behavior

- Each arriving guest gets a numbered identity and a complete route from the current round through the last round. Their route is committed before their photo card appears.
- Existing table numbers and issued routes never change when another guest arrives. Configuration locks after a route is issued or the event advances beyond round one.
- Current-round seating first minimizes crowding and gender imbalance beyond the preferred targets, then favors occupied tables, fewer people of the arriving gender, and the earlier table number. This preserves the requested M/M/M/W/M/M/W sequence: tables 1/1/2/1/2/3/2.
- Future-round routes use deterministic bounded search, prioritizing size and balance preferences before minimizing repeated encounters. Every valid arrival is admitted, including a third person of either gender or a fifth person at a table. Issued routes remain unchanged.
- There is no capacity waitlist or quota display. Database calls from older API versions that submit an empty route also receive a complete route automatically. Retrying a previously waiting guest reuses their identity and number.
- A lost check-in response retains its request ID in the browser session. Retrying retrieves the same guest rather than creating another one.
- Existing planned-roster events remain unchanged. They are not silently emptied or converted.

## Data guarantees

Three service-only, security-invoker RPCs create an empty event, configure it before routes are issued, and commit an arrival. Event locking plus route-revision/current-round checks serialize reception changes. Database triggers enforce complete routes, unique seats, immutable issued seats, and consistent event/schedule dimensions. Seat numbers can exceed four. Repeat metrics are derived from committed rows.

Fixed-route bundle reads paginate attendees and seats and validate the final revision, preventing truncated or mixed snapshots during concurrent arrivals. Explicit deletion of an entire event remains atomic; individual issued routes cannot be deleted or regenerated. Deferring the attendee-seat foreign-key check allows valid event cascades while preserving referential integrity at commit.

## Verification

- All 97 Room tests pass, including the actual API handler, database permissions, concurrency, idempotency, pagination, timer/round changes, immutable photo routes, and legacy regressions. New cases admit thirty mixed guests at five tables, thirty-one men, guests beyond four at one table for twenty rounds, and old empty-route requests without waitlisting. Old waiting identities are recovered without duplication.
- Production build passes with the bundled supported Node runtime.
- Browser preview checked from zero through twenty-one male arrivals at five tables. Every guest immediately receives a photo card; reception remains open with no quota or waitlist display.
- Full repository TypeScript checking still has unrelated existing errors; no errors in Room files.

## Rollout

Required migration order for this version:

1. `20260824130627_make_the_room_walk_ins_concurrency_safe.sql`
2. `20260831123042_the_room_atomic_setup.sql`
3. `20260831124115_the_room_round_timer.sql`
4. `20260831131002_the_room_fixed_routes.sql`
5. `20260831141044_the_room_unlimited_arrivals.sql`

The first four were applied on August 31. Deploy the unlimited-arrivals migration with the matching API/frontend, then recover any checked-in waiting guests at open fixed-route events through the arrival RPC, preserving their identities. Existing events retain their previous seating mode and issued plans; no extra physical tables are created.
