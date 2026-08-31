-- Starting at zero does not impose an estimated guest limit.
-- Keep physical tables and issued routes fixed; table size and gender balance
-- are soft preferences. Every valid arrival receives a complete remaining route.

create or replace function public.guard_the_room_fixed_seat()
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
     or new.seat_number < 1
     or not exists (select 1 from public.the_room_schedule_runs where id = new.schedule_run_id and event_id = new.event_id and is_active) then
    raise exception using errcode = '22023', message = 'The guest route contains an invalid seat or a past round';
  end if;
  return new;
end;
$$;

create or replace function public.commit_the_room_fixed_arrival(
  p_event_id uuid, p_attendee_id uuid, p_gender text, p_expected_revision integer,
  p_expected_active_round integer, p_rows jsonb, p_repeat_pair_count integer default 0
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_event public.the_room_events%rowtype;
  v_person public.the_room_attendees%rowtype;
  v_run_id uuid;
  v_number integer;
  v_route jsonb;
  v_round integer;
  v_table integer;
  v_seat integer;
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
  v_route := p_rows;
  -- Older API versions sent an empty route when their estimate was exhausted.
  -- Admit those requests too, using the same soft size/balance preferences.
  if jsonb_array_length(v_route) = 0 then
    for v_round in v_event.active_round..v_event.round_count loop
      select choice.table_number, choice.next_seat into v_table, v_seat
      from (
        select physical.table_number, count(seat.id)::integer as occupants,
          count(seat.id) filter (where person.gender = p_gender)::integer as same_gender,
          coalesce(max(seat.seat_number), 0) + 1 as next_seat,
          count(seat.id) filter (where exists (
            select 1 from jsonb_to_recordset(v_route) as earlier(round_number integer, table_number integer)
            join public.the_room_seats previous on previous.schedule_run_id = v_run_id
              and previous.round_number = earlier.round_number and previous.table_number = earlier.table_number
              and previous.attendee_id = seat.attendee_id
          ))::integer as repeated_companions
        from pg_catalog.generate_series(1, v_event.table_count) as physical(table_number)
        left join public.the_room_seats seat on seat.schedule_run_id = v_run_id
          and seat.round_number = v_round and seat.table_number = physical.table_number
        left join public.the_room_attendees person on person.id = seat.attendee_id
        group by physical.table_number
      ) choice
      order by greatest(0, choice.occupants + 1 - 4), greatest(0, choice.same_gender + 1 - 2),
        case when v_round = v_event.active_round then 0 else choice.repeated_companions end,
        (choice.occupants = 0)::integer, choice.same_gender, choice.table_number
      limit 1;
      v_route := v_route || jsonb_build_array(jsonb_build_object(
        'attendee_id', p_attendee_id, 'round_number', v_round, 'table_number', v_table, 'seat_number', v_seat
      ));
    end loop;
  end if;
  if (
    jsonb_array_length(v_route) <> v_event.round_count - v_event.active_round + 1
    or exists (select 1 from jsonb_to_recordset(v_route) as seat(attendee_id uuid, round_number integer, table_number integer, seat_number integer)
      where seat.attendee_id is distinct from p_attendee_id or seat.round_number is null
        or seat.round_number not between v_event.active_round and v_event.round_count
        or seat.table_number is null or seat.table_number not between 1 and v_event.table_count
        or seat.seat_number is null or seat.seat_number < 1)
    or (select count(distinct seat.round_number) from jsonb_to_recordset(v_route) as seat(round_number integer))
       <> v_event.round_count - v_event.active_round + 1
  ) then
    raise exception using errcode = '22023', message = 'A route must assign this guest exactly once in every remaining round';
  end if;
  if v_existing then
    update public.the_room_attendees set attendance_status = 'confirmed',
      included_in_schedule = true, checked_in = true, updated_at = pg_catalog.clock_timestamp()
    where id = p_attendee_id returning * into v_person;
  else
    select coalesce(max(attendee_number), 0) + 1 into v_number from public.the_room_attendees where event_id = p_event_id;
    insert into public.the_room_attendees (id, event_id, attendee_number, full_name, gender, attendance_status, included_in_schedule, checked_in, amount_due)
    values (p_attendee_id, p_event_id, v_number, 'Guest ' || v_number, p_gender,
      'confirmed', true, true, 0) returning * into v_person;
  end if;
  insert into public.the_room_seats (schedule_run_id, event_id, round_number, table_number, seat_number, attendee_id)
  select v_run_id, p_event_id, seat.round_number, seat.table_number, seat.seat_number, p_attendee_id
  from jsonb_to_recordset(v_route) as seat(round_number integer, table_number integer, seat_number integer)
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

revoke execute on function public.guard_the_room_fixed_seat(),
  public.commit_the_room_fixed_arrival(uuid, uuid, text, integer, integer, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.guard_the_room_fixed_seat(),
  public.commit_the_room_fixed_arrival(uuid, uuid, text, integer, integer, jsonb, integer)
  to service_role;
