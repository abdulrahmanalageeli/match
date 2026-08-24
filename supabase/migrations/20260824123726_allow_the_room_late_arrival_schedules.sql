create or replace function public.replace_the_room_schedule(
  p_event_id uuid,
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
  v_run_id uuid := gen_random_uuid();
  v_participant_count integer;
  v_round_count integer;
  v_table_count integer;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
    raise exception 'The Room schedule rows must be a non-empty array';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('the-room-schedule:' || p_event_id::text, 0)
  );

  select * into v_event
  from public.the_room_events
  where id = p_event_id
  for update;
  if not found then raise exception 'The Room event was not found'; end if;

  select count(distinct row_data.attendee_id), max(row_data.round_number), max(row_data.table_number)
    into v_participant_count, v_round_count, v_table_count
  from jsonb_to_recordset(p_rows) as row_data(
    attendee_id uuid,
    round_number integer,
    table_number integer,
    seat_number integer
  );

  if v_round_count <> v_event.round_count or v_table_count > v_event.table_count then
    raise exception 'Schedule dimensions do not match The Room event configuration';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row_data(
      attendee_id uuid,
      round_number integer,
      table_number integer,
      seat_number integer
    )
    left join public.the_room_attendees attendee
      on attendee.id = row_data.attendee_id and attendee.event_id = p_event_id
    where attendee.id is null
       or attendee.included_in_schedule is not true
       or attendee.attendance_status not in ('registered', 'confirmed')
  ) then
    raise exception 'Schedule contains an attendee outside this The Room event';
  end if;

  -- Late arrivals have no fictional seat in completed rounds, but every guest
  -- in the schedule must be seated once in the active and all future rounds.
  if exists (
    select 1
    from pg_catalog.generate_series(v_event.active_round, v_event.round_count) as required(round_number)
    left join jsonb_to_recordset(p_rows) as row_data(
      attendee_id uuid,
      round_number integer,
      table_number integer,
      seat_number integer
    ) on row_data.round_number = required.round_number
    group by required.round_number
    having count(distinct row_data.attendee_id) <> v_participant_count
  ) then
    raise exception 'Every included attendee must be seated in the active and future rounds';
  end if;

  update public.the_room_schedule_runs
  set is_active = false
  where event_id = p_event_id and is_active;

  insert into public.the_room_schedule_runs (
    id, event_id, seed, algorithm_version, participant_count,
    table_count, round_count, metrics, is_active
  ) values (
    v_run_id,
    p_event_id,
    p_seed,
    p_algorithm_version,
    v_participant_count,
    v_event.table_count,
    v_event.round_count,
    coalesce(p_metrics, '{}'::jsonb),
    true
  );

  insert into public.the_room_seats (
    schedule_run_id, event_id, round_number, table_number, seat_number, attendee_id
  )
  select
    v_run_id,
    p_event_id,
    row_data.round_number,
    row_data.table_number,
    row_data.seat_number,
    row_data.attendee_id
  from jsonb_to_recordset(p_rows) as row_data(
    attendee_id uuid,
    round_number integer,
    table_number integer,
    seat_number integer
  );

  update public.the_room_events
  set status = case when status in ('draft', 'registration') then 'ready' else status end,
      updated_at = pg_catalog.now()
  where id = p_event_id;

  return v_run_id;
end;
$$;

revoke execute on function public.replace_the_room_schedule(uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_the_room_schedule(uuid, text, text, jsonb, jsonb)
  to service_role;
