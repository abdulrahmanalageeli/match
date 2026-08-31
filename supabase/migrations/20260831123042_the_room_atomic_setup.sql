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
