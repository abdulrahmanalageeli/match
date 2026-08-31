alter table public.the_room_events
  add column timer_duration_seconds integer not null default 1800 check (timer_duration_seconds between 60 and 7200),
  add column timer_remaining_seconds integer not null default 1800 check (timer_remaining_seconds between 0 and 7200),
  add column timer_ends_at timestamptz,
  add column timer_revision integer not null default 0 check (timer_revision >= 0);

-- Round changes reset the countdown in the same transaction as the advance.
-- Seating extensions and ordinary attendance changes leave it alone.
create function public.reset_the_room_timer_on_round_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.active_round is distinct from old.active_round
     or new.round_count is distinct from old.round_count
     or new.table_count is distinct from old.table_count
     or (new.status = 'draft' and old.status is distinct from new.status) then
    new.timer_ends_at := null;
    new.timer_remaining_seconds := new.timer_duration_seconds;
    new.timer_revision := old.timer_revision + 1;
  end if;
  return new;
end;
$$;
create trigger the_room_reset_round_timer before update on public.the_room_events
for each row execute function public.reset_the_room_timer_on_round_change();

create function public.control_the_room_timer(
  p_event_id uuid,
  p_expected_active_round integer,
  p_expected_revision integer,
  p_command text,
  p_duration_seconds integer default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.the_room_events%rowtype;
  v_now timestamptz;
  v_remaining integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('the-room-schedule:' || p_event_id::text, 0));
  select * into v_event from public.the_room_events where id = p_event_id for update;
  if not found then raise exception 'The Room event was not found'; end if;
  if v_event.active_round is distinct from p_expected_active_round
     or v_event.timer_revision is distinct from p_expected_revision then
    raise exception using errcode = '40001', message = 'The round timer changed on another device';
  end if;
  if not exists (select 1 from public.the_room_schedule_runs where event_id = p_event_id and is_active) then
    raise exception using errcode = '22023', message = 'Prepare the schedule before starting the timer';
  end if;
  v_now := pg_catalog.clock_timestamp();
  v_remaining := case when v_event.timer_ends_at is not null
    then greatest(0, ceil(extract(epoch from (v_event.timer_ends_at - v_now)))::integer)
    else v_event.timer_remaining_seconds end;

  if p_command = 'start' then
    if v_remaining = 0 then
      raise exception using errcode = '22023', message = 'Reset the finished timer before starting it again';
    end if;
    if v_event.timer_ends_at is not null then return p_event_id; end if;
    update public.the_room_events
    set timer_ends_at = v_now + pg_catalog.make_interval(secs => v_remaining),
        timer_revision = timer_revision + 1, updated_at = v_now
    where id = p_event_id;
  elsif p_command = 'pause' then
    if v_event.timer_ends_at is null then return p_event_id; end if;
    update public.the_room_events
    set timer_remaining_seconds = v_remaining, timer_ends_at = null,
        timer_revision = timer_revision + 1, updated_at = v_now
    where id = p_event_id;
  elsif p_command in ('reset', 'set-duration') then
    if p_command = 'set-duration' then
      if p_duration_seconds is null or p_duration_seconds < 60 or p_duration_seconds > 7200 then
        raise exception using errcode = '22023', message = 'Round duration must be between 1 and 120 minutes';
      end if;
      if v_event.timer_ends_at is not null and v_remaining > 0 then
        raise exception using errcode = '22023', message = 'Pause the timer before changing its duration';
      end if;
    end if;
    update public.the_room_events
    set timer_duration_seconds = case when p_command = 'set-duration' then p_duration_seconds else timer_duration_seconds end,
        timer_remaining_seconds = case when p_command = 'set-duration' then p_duration_seconds else timer_duration_seconds end,
        timer_ends_at = null, timer_revision = timer_revision + 1, updated_at = v_now
    where id = p_event_id;
  else
    raise exception using errcode = '22023', message = 'Unknown timer command';
  end if;
  return p_event_id;
end;
$$;

revoke execute on function public.control_the_room_timer(uuid, integer, integer, text, integer) from public, anon, authenticated;
grant execute on function public.control_the_room_timer(uuid, integer, integer, text, integer) to service_role;
revoke execute on function public.reset_the_room_timer_on_round_change() from public, anon, authenticated;
grant execute on function public.reset_the_room_timer_on_round_change() to service_role;

-- Full regeneration restarts the timer, including when already in round one.
-- Commit a prepared setup as one unit. Computation happens before this call;
-- the short transaction only checks the snapshot and saves the result.
create or replace function public.save_the_room_setup_if_current(
  p_event_id uuid,
  p_expected_event_updated_at timestamptz,
  p_expected_schedule_run_id uuid,
  p_expected_active_round integer,
  p_minimum_attendees integer,
  p_table_count integer,
  p_round_count integer,
  p_active_round integer,
  p_new_attendees jsonb,
  p_seed text,
  p_algorithm_version text,
  p_metrics jsonb,
  p_rows jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.the_room_events%rowtype;
  v_schedule_run_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('the-room-schedule:' || p_event_id::text, 0)
  );
  select * into v_event from public.the_room_events where id = p_event_id for update;
  if not found then raise exception 'The Room event was not found'; end if;

  select id into v_schedule_run_id from public.the_room_schedule_runs
  where event_id = p_event_id and is_active;
  if v_event.updated_at is distinct from p_expected_event_updated_at
     or v_event.active_round is distinct from p_expected_active_round
     or v_schedule_run_id is distinct from p_expected_schedule_run_id then
    raise exception using errcode = '40001', message = 'The Room event changed on another device';
  end if;
  if p_active_round is null or (p_active_round <> 1 and p_active_round <> v_event.active_round) then
    raise exception 'Setup must preserve the current round or restart at round one';
  end if;
  if jsonb_typeof(p_new_attendees) is distinct from 'array' then
    raise exception 'New attendees must be an array';
  end if;

  insert into public.the_room_attendees (
    id, event_id, attendee_number, full_name, gender, attendance_status, included_in_schedule, amount_due
  )
  select person.id, p_event_id, person.attendee_number, person.full_name, person.gender, 'confirmed', true, 0
  from jsonb_to_recordset(p_new_attendees) as person(id uuid, attendee_number integer, full_name text, gender text);

  update public.the_room_events
  set minimum_attendees = p_minimum_attendees,
      table_count = p_table_count,
      round_count = p_round_count,
      active_round = p_active_round,
      timer_ends_at = case when p_algorithm_version = 'the-room-social-table-v3-gender-fair' then null else timer_ends_at end,
      timer_remaining_seconds = case when p_algorithm_version = 'the-room-social-table-v3-gender-fair' then timer_duration_seconds else timer_remaining_seconds end,
      timer_revision = timer_revision + case when p_algorithm_version = 'the-room-social-table-v3-gender-fair' then 1 else 0 end,
      updated_at = pg_catalog.now()
  where id = p_event_id;

  -- The replacement validates every active roster member and every required
  -- round. Any failure rolls back the settings and roster additions as well.
  return public.replace_the_room_schedule(p_event_id, p_seed, p_algorithm_version, p_metrics, p_rows);
end;
$$;

revoke execute on function public.save_the_room_setup_if_current(uuid, timestamptz, uuid, integer, integer, integer, integer, integer, jsonb, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_the_room_setup_if_current(uuid, timestamptz, uuid, integer, integer, integer, integer, integer, jsonb, text, text, jsonb, jsonb)
  to service_role;
