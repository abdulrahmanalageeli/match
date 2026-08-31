-- Fixed routes start with an empty roster and a fixed pool of physical tables.
-- Existing events retain their planned-roster behavior.
alter table public.the_room_events
  add column seating_mode text not null default 'planned' check (seating_mode in ('planned', 'fixed_routes')),
  add column route_revision integer not null default 0 check (route_revision >= 0),
  add constraint the_room_fixed_events_no_placeholders check (seating_mode <> 'fixed_routes' or minimum_attendees = 0),
  drop constraint the_room_events_minimum_attendees_check,
  add constraint the_room_events_minimum_attendees_check check (minimum_attendees between 0 and 500);
alter table public.the_room_schedule_runs
  drop constraint the_room_schedule_runs_participant_count_check,
  add constraint the_room_schedule_runs_participant_count_check check (participant_count >= 0);

-- Check this relationship at commit so one explicit event DELETE can cascade
-- through both attendees and seats regardless of PostgreSQL trigger ordering.
-- Individual attendee deletion still cannot leave a referenced seat behind.
alter table public.the_room_seats
  drop constraint the_room_seats_attendee_id_event_id_fkey,
  add constraint the_room_seats_attendee_id_event_id_fkey foreign key (attendee_id, event_id)
    references public.the_room_attendees(id, event_id) on delete no action deferrable initially deferred;

create function public.guard_the_room_fixed_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.seating_mode is distinct from new.seating_mode then
    raise exception using errcode = '55000', message = 'An existing event cannot change its seating mode';
  end if;
  if old.seating_mode = 'fixed_routes' then
    if new.minimum_attendees <> 0 then
      raise exception using errcode = '22023', message = 'Fixed-route events start without placeholder guests';
    end if;
    if new.active_round < old.active_round then
      raise exception using errcode = '55000', message = 'A fixed-route event cannot return to an earlier round';
    end if;
    if exists (select 1 from public.the_room_seats where event_id = old.id)
       and (new.table_count <> old.table_count or new.round_count <> old.round_count
         or new.status in ('draft', 'registration')) then
      raise exception using errcode = '55000', message = 'Issued guest routes lock the event tables and rounds';
    end if;
  end if;
  return new;
end;
$$;
create trigger the_room_guard_fixed_event before update on public.the_room_events
for each row execute function public.guard_the_room_fixed_event();

create function public.guard_the_room_fixed_run()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.the_room_events%rowtype;
begin
  if tg_op = 'UPDATE' and new.event_id <> old.event_id
     and exists (select 1 from public.the_room_events where id = old.event_id and seating_mode = 'fixed_routes') then
    raise exception using errcode = '55000', message = 'The fixed guest schedule cannot move to another event';
  end if;
  select * into v_event from public.the_room_events
  where id = case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  -- During an explicit event deletion the parent is gone; permit its cascades.
  if not found or v_event.seating_mode <> 'fixed_routes' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'The fixed guest schedule cannot be removed';
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.the_room_schedule_runs where event_id = v_event.id) then
    raise exception using errcode = '55000', message = 'The fixed guest schedule cannot be replaced';
  end if;
  if not new.is_active or new.table_count <> v_event.table_count or new.round_count <> v_event.round_count then
    raise exception using errcode = '55000', message = 'The fixed guest schedule must remain active with the configured dimensions';
  end if;
  if tg_op = 'UPDATE' and (new.event_id <> old.event_id or new.id <> old.id
      or (exists (select 1 from public.the_room_seats where schedule_run_id = old.id)
        and (new.table_count <> old.table_count or new.round_count <> old.round_count))) then
    raise exception using errcode = '55000', message = 'Issued guest routes cannot change schedule identity or dimensions';
  end if;
  return new;
end;
$$;
create trigger the_room_guard_fixed_run before insert or update or delete on public.the_room_schedule_runs
for each row execute function public.guard_the_room_fixed_run();

-- Creation and pre-arrival configuration must update the event and its one
-- empty schedule together. The deferred check observes the final transaction.
create function public.validate_the_room_fixed_event()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.the_room_events%rowtype;
begin
  select * into v_event from public.the_room_events where id = new.id;
  if not found or v_event.seating_mode <> 'fixed_routes' then return null; end if;
  if (select count(*) from public.the_room_schedule_runs where event_id = v_event.id and is_active
      and table_count = v_event.table_count and round_count = v_event.round_count) <> 1 then
    raise exception using errcode = '22023', message = 'The fixed event and active schedule must have matching dimensions';
  end if;
  return null;
end;
$$;
create constraint trigger the_room_validate_fixed_event after insert or update on public.the_room_events
deferrable initially deferred for each row execute function public.validate_the_room_fixed_event();

create function public.guard_the_room_fixed_seat()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.the_room_events%rowtype;
  v_gender text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if exists (select 1 from public.the_room_events where id = old.event_id and seating_mode = 'fixed_routes') then
      raise exception using errcode = '55000', message = 'Issued guest routes cannot be moved or removed';
    end if;
    if tg_op = 'DELETE' then return old; end if;
  end if;
  select * into v_event from public.the_room_events where id = new.event_id;
  if not found or v_event.seating_mode <> 'fixed_routes' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('the-room-schedule:' || new.event_id::text, 0));
  select * into v_event from public.the_room_events where id = new.event_id for update;
  select gender into v_gender from public.the_room_attendees where id = new.attendee_id and event_id = new.event_id;
  if v_event.status not in ('ready', 'live') or v_gender is null or v_gender not in ('male', 'female')
     or new.round_number not between v_event.active_round and v_event.round_count
     or new.table_number not between 1 and v_event.table_count
     or new.seat_number not between 1 and 4
     or not exists (select 1 from public.the_room_schedule_runs where id = new.schedule_run_id and event_id = new.event_id and is_active) then
    raise exception using errcode = '22023', message = 'The guest route contains an invalid seat or a past round';
  end if;
  if (select count(*) from public.the_room_seats where schedule_run_id = new.schedule_run_id
      and round_number = new.round_number and table_number = new.table_number) >= 4
     or (select count(*) from public.the_room_seats seat
       join public.the_room_attendees person on person.id = seat.attendee_id
       where seat.schedule_run_id = new.schedule_run_id and seat.round_number = new.round_number
         and seat.table_number = new.table_number and person.gender = v_gender) >= 2 then
    raise exception using errcode = '22023', message = 'Each table is limited to two men and two women';
  end if;
  return new;
end;
$$;
create trigger the_room_guard_fixed_seat before insert or update or delete on public.the_room_seats
for each row execute function public.guard_the_room_fixed_seat();

create function public.guard_the_room_fixed_attendee()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.the_room_events where id = old.event_id and seating_mode = 'fixed_routes')
     and exists (select 1 from public.the_room_seats where attendee_id = old.id and event_id = old.event_id) then
    if tg_op = 'DELETE' then
      raise exception using errcode = '55000', message = 'A guest with an issued route cannot be removed';
    end if;
    if new.gender <> old.gender or new.event_id <> old.event_id or new.id <> old.id
       or new.included_in_schedule <> old.included_in_schedule
       or new.attendance_status <> old.attendance_status or new.checked_in <> old.checked_in then
      raise exception using errcode = '55000', message = 'A guest with an issued route cannot change seating eligibility';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger the_room_guard_fixed_attendee before update or delete on public.the_room_attendees
for each row execute function public.guard_the_room_fixed_attendee();

-- Deferred validation permits the attendee and their whole route to be inserted
-- in one transaction, but rejects legacy walk-ins without a complete route.
create function public.validate_the_room_fixed_attendee()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_person public.the_room_attendees%rowtype;
  v_event public.the_room_events%rowtype;
  v_first_round integer;
  v_count integer;
begin
  select * into v_person from public.the_room_attendees where id = new.id;
  if not found then return null; end if;
  select * into v_event from public.the_room_events where id = v_person.event_id;
  if not found or v_event.seating_mode <> 'fixed_routes' then return null; end if;
  select min(round_number), count(*) into v_first_round, v_count
  from public.the_room_seats where event_id = v_event.id and attendee_id = v_person.id;
  if v_person.gender not in ('male', 'female') or not v_person.checked_in
     or v_person.attendance_status not in ('confirmed', 'waitlist')
     or (v_person.attendance_status = 'waitlist' and (v_person.included_in_schedule or v_count <> 0))
     or (v_person.attendance_status = 'confirmed' and (not v_person.included_in_schedule
       or v_first_round is null or v_count <> v_event.round_count - v_first_round + 1)) then
    raise exception using errcode = '22023', message = 'A checked-in guest needs either a complete fixed route or a waiting-list place';
  end if;
  return null;
end;
$$;
create constraint trigger the_room_validate_fixed_attendee after insert or update on public.the_room_attendees
deferrable initially deferred for each row execute function public.validate_the_room_fixed_attendee();

create function public.create_fixed_the_room_event(p_event_number bigint, p_table_count integer, p_round_count integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.the_room_events%rowtype;
begin
  if p_event_number is null or p_event_number < 1 or p_table_count is null or p_table_count not between 1 and 50
     or p_round_count is null or p_round_count not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Choose a valid event number, table count, and round count';
  end if;
  insert into public.the_room_events (event_number, minimum_attendees, table_count, round_count, seating_mode, status)
  values (p_event_number, 0, p_table_count, p_round_count, 'fixed_routes', 'ready') returning * into v_event;
  insert into public.the_room_schedule_runs (event_id, seed, algorithm_version, participant_count, table_count, round_count, metrics)
  values (v_event.id, 'fixed-routes:' || v_event.id::text, 'the-room-fixed-routes-v1', 0,
    p_table_count, p_round_count, '{"repeatPairCount":0,"uniquePairCount":0}'::jsonb);
  return to_jsonb(v_event);
end;
$$;

create function public.configure_the_room_fixed_event(
  p_event_id uuid, p_table_count integer, p_round_count integer, p_expected_revision integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.the_room_events%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('the-room-schedule:' || p_event_id::text, 0));
  select * into v_event from public.the_room_events where id = p_event_id for update;
  if not found or v_event.seating_mode <> 'fixed_routes' then
    raise exception using errcode = '22023', message = 'The fixed-route event was not found';
  end if;
  if v_event.route_revision is distinct from p_expected_revision then
    raise exception using errcode = '40001', message = 'The guest routes changed on another device';
  end if;
  if exists (select 1 from public.the_room_seats where event_id = p_event_id)
     or v_event.active_round > 1 then
    raise exception using errcode = '55000', message = 'Tables and rounds are locked after routes are issued or rounds advance';
  end if;
  if p_table_count is null or p_table_count not between 1 and 50
     or p_round_count is null or p_round_count not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Choose a valid table count and round count';
  end if;
  update public.the_room_events set table_count = p_table_count, round_count = p_round_count,
    route_revision = route_revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_event_id returning * into v_event;
  update public.the_room_schedule_runs set table_count = p_table_count, round_count = p_round_count
  where event_id = p_event_id and is_active;
  return to_jsonb(v_event);
end;
$$;

create function public.commit_the_room_fixed_arrival(
  p_event_id uuid, p_attendee_id uuid, p_gender text, p_expected_revision integer,
  p_expected_active_round integer, p_rows jsonb, p_repeat_pair_count integer default 0
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.the_room_events%rowtype;
  v_person public.the_room_attendees%rowtype;
  v_run_id uuid;
  v_number integer;
  v_waitlist boolean;
  v_existing boolean;
  v_repeats integer;
  v_total_repeats integer;
  v_unique_pairs integer;
begin
  if p_attendee_id is null or p_gender is null or p_gender not in ('male', 'female')
     or jsonb_typeof(p_rows) is distinct from 'array' or p_repeat_pair_count is null or p_repeat_pair_count < 0 then
    raise exception using errcode = '22023', message = 'Choose a guest identity, gender, and complete route';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('the-room-schedule:' || p_event_id::text, 0));
  select * into v_event from public.the_room_events where id = p_event_id for update;
  if not found or v_event.seating_mode <> 'fixed_routes' then
    raise exception using errcode = '22023', message = 'The fixed-route event was not found';
  end if;
  select * into v_person from public.the_room_attendees where id = p_attendee_id;
  v_existing := found;
  if v_existing and (v_person.event_id <> p_event_id or v_person.gender <> p_gender) then
    raise exception using errcode = '22023', message = 'The guest identity was already used for another arrival';
  end if;
  if v_existing and v_person.attendance_status = 'confirmed' and v_person.included_in_schedule then
    select coalesce(sum(meetings - 1), 0)::integer into v_repeats from (
      select count(*) as meetings from public.the_room_seats mine
      join public.the_room_seats other on other.schedule_run_id = mine.schedule_run_id
        and other.round_number = mine.round_number and other.table_number = mine.table_number
        and other.attendee_id <> mine.attendee_id
      where mine.event_id = p_event_id and mine.attendee_id = p_attendee_id group by other.attendee_id
    ) pairs;
    return jsonb_build_object('attendee', to_jsonb(v_person), 'status', 'confirmed', 'repeat_pair_count', v_repeats, 'idempotent', true);
  end if;
  if v_event.route_revision is distinct from p_expected_revision
     or v_event.active_round is distinct from p_expected_active_round then
    raise exception using errcode = '40001', message = 'The guest routes or current round changed on another device';
  end if;
  if v_event.status not in ('ready', 'live') then
    raise exception using errcode = '22023', message = 'This event is not accepting arrivals';
  end if;
  select id into v_run_id from public.the_room_schedule_runs where event_id = p_event_id and is_active;
  if not found then raise exception using errcode = '55000', message = 'The fixed guest schedule is missing'; end if;
  v_waitlist := jsonb_array_length(p_rows) = 0;
  if not v_waitlist and (
    jsonb_array_length(p_rows) <> v_event.round_count - v_event.active_round + 1
    or exists (select 1 from jsonb_to_recordset(p_rows) as seat(attendee_id uuid, round_number integer, table_number integer, seat_number integer)
      where seat.attendee_id is distinct from p_attendee_id or seat.round_number is null
        or seat.round_number not between v_event.active_round and v_event.round_count
        or seat.table_number is null or seat.table_number not between 1 and v_event.table_count
        or seat.seat_number is null or seat.seat_number not between 1 and 4)
    or (select count(distinct seat.round_number) from jsonb_to_recordset(p_rows) as seat(round_number integer))
       <> v_event.round_count - v_event.active_round + 1
  ) then
    raise exception using errcode = '22023', message = 'A route must assign this guest exactly once in every remaining round';
  end if;
  if v_existing then
    update public.the_room_attendees set attendance_status = case when v_waitlist then 'waitlist' else 'confirmed' end,
      included_in_schedule = not v_waitlist, checked_in = true, updated_at = pg_catalog.clock_timestamp()
    where id = p_attendee_id returning * into v_person;
  else
    select coalesce(max(attendee_number), 0) + 1 into v_number from public.the_room_attendees where event_id = p_event_id;
    insert into public.the_room_attendees (id, event_id, attendee_number, full_name, gender, attendance_status, included_in_schedule, checked_in, amount_due)
    values (p_attendee_id, p_event_id, v_number, 'Guest ' || v_number, p_gender,
      case when v_waitlist then 'waitlist' else 'confirmed' end, not v_waitlist, true, 0) returning * into v_person;
  end if;
  insert into public.the_room_seats (schedule_run_id, event_id, round_number, table_number, seat_number, attendee_id)
  select v_run_id, p_event_id, seat.round_number, seat.table_number, seat.seat_number, p_attendee_id
  from jsonb_to_recordset(p_rows) as seat(round_number integer, table_number integer, seat_number integer)
  order by seat.round_number;
  -- Derive repeat metrics from committed routes instead of trusting client input.
  select coalesce(sum(meetings - 1), 0)::integer,
    coalesce(sum(case when left_id = p_attendee_id or right_id = p_attendee_id then meetings - 1 else 0 end), 0)::integer,
    count(*)::integer into v_total_repeats, v_repeats, v_unique_pairs
  from (
    select left_seat.attendee_id as left_id, right_seat.attendee_id as right_id, count(*) as meetings
    from public.the_room_seats left_seat join public.the_room_seats right_seat
      on right_seat.schedule_run_id = left_seat.schedule_run_id and right_seat.round_number = left_seat.round_number
      and right_seat.table_number = left_seat.table_number and right_seat.attendee_id > left_seat.attendee_id
    where left_seat.schedule_run_id = v_run_id group by left_seat.attendee_id, right_seat.attendee_id
  ) pairs;
  update public.the_room_schedule_runs set participant_count = (select count(*) from public.the_room_attendees
      where event_id = p_event_id and included_in_schedule and attendance_status = 'confirmed'),
    metrics = metrics || jsonb_build_object('repeatPairCount', v_total_repeats, 'uniquePairCount', v_unique_pairs)
  where id = v_run_id;
  update public.the_room_events set route_revision = route_revision + 1, updated_at = pg_catalog.clock_timestamp()
  where id = p_event_id;
  return jsonb_build_object('attendee', to_jsonb(v_person), 'status', v_person.attendance_status,
    'repeat_pair_count', v_repeats, 'idempotent', false);
end;
$$;

revoke execute on function public.guard_the_room_fixed_event(), public.guard_the_room_fixed_run(),
  public.guard_the_room_fixed_seat(), public.guard_the_room_fixed_attendee(), public.validate_the_room_fixed_attendee(), public.validate_the_room_fixed_event(),
  public.create_fixed_the_room_event(bigint, integer, integer), public.configure_the_room_fixed_event(uuid, integer, integer, integer),
  public.commit_the_room_fixed_arrival(uuid, uuid, text, integer, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.guard_the_room_fixed_event(), public.guard_the_room_fixed_run(),
  public.guard_the_room_fixed_seat(), public.guard_the_room_fixed_attendee(), public.validate_the_room_fixed_attendee(), public.validate_the_room_fixed_event(),
  public.create_fixed_the_room_event(bigint, integer, integer), public.configure_the_room_fixed_event(uuid, integer, integer, integer),
  public.commit_the_room_fixed_arrival(uuid, uuid, text, integer, integer, jsonb, integer) to service_role;
