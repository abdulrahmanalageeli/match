-- New events use fifty-minute rounds. Existing running, paused, completed,
-- or explicitly configured timers retain their saved state.
alter table public.the_room_events
  alter column timer_duration_seconds set default 3000,
  alter column timer_remaining_seconds set default 3000;

-- Adopt the new default only for open events whose timer was never touched.
-- Bump the revision so a stale organizer screen cannot start the old duration.
update public.the_room_events
set timer_duration_seconds = 3000,
    timer_remaining_seconds = 3000,
    timer_revision = timer_revision + 1,
    updated_at = pg_catalog.clock_timestamp()
where status in ('draft', 'ready', 'live')
  and active_round = 1
  and timer_revision = 0
  and timer_duration_seconds = 1800
  and timer_remaining_seconds = 1800
  and timer_ends_at is null;
