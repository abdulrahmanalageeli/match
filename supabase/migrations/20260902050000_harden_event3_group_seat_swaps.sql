-- Participant seat swaps share the Event3 runtime lock with seating approval,
-- format changes, and table-label swaps. The caller signs the exact live/test
-- session it observed so a delayed admin request cannot mutate a later session.
-- Replacing the four-argument RPC makes legacy callers fail closed.
revoke all on function public.swap_event3_group_seats(uuid, integer, integer, integer)
  from public, anon, authenticated, service_role;
drop function public.swap_event3_group_seats(uuid, integer, integer, integer);

create or replace function public.swap_event3_group_seats_v2(
  p_match_id uuid,
  p_event_id integer,
  p_participant_a integer,
  p_participant_b integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_event_format text;
  v_rounds smallint[];
  v_round smallint;
  v_table_a integer;
  v_table_b integer;
  v_updated integer := 0;
  v_round_updated integer := 0;
begin
  if p_match_id is null or p_event_id is null or p_event_id <= 0 then
    raise exception 'A valid match and event are required' using errcode = '22023';
  end if;
  if p_expected_test_mode is null then
    raise exception 'The expected Event3 test-mode state is required' using errcode = '22023';
  end if;
  if p_participant_a is null or p_participant_b is null
     or p_participant_a <= 0 or p_participant_b <= 0
     or p_participant_a = 9999 or p_participant_b = 9999
     or p_participant_a = p_participant_b then
    raise exception 'Two different participant numbers are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );

  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Group seats can only be swapped for the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from p_expected_test_mode
     or (p_expected_test_mode and
       (v_state.test_mode_snapshot ->> 'started_at') is distinct from p_expected_started_at) then
    raise exception 'The Event3 live/test session changed before the participant seat swap' using errcode = '55000';
  end if;

  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = p_match_id and settings.event_id = p_event_id;

  if v_event_format = 'choice_only_three_groups' then
    if v_state.phase is distinct from 'setup' then
      raise exception 'Choice-only group seats can only be swapped during setup for the active event' using errcode = '55000';
    end if;
    v_rounds := array[1, 2, 3]::smallint[];
  else
    v_rounds := array[1, 2]::smallint[];
  end if;

  -- Legacy single-seat moves do not take the Event3 runtime lock. This table
  -- lock keeps the read-then-write exchange exact even if one is in flight.
  lock table public.session_assignments in share row exclusive mode;

  foreach v_round in array v_rounds
  loop
    select assignment.table_number into v_table_a
    from public.session_assignments assignment
    where assignment.match_id = p_match_id
      and assignment.event_id = p_event_id
      and assignment.round = v_round
      and assignment.participant_id = p_participant_a;

    select assignment.table_number into v_table_b
    from public.session_assignments assignment
    where assignment.match_id = p_match_id
      and assignment.event_id = p_event_id
      and assignment.round = v_round
      and assignment.participant_id = p_participant_b;

    if v_event_format = 'choice_only_three_groups'
       and (v_table_a is null or v_table_b is null) then
      raise exception 'Both participants must have an assignment in every choice-only group round' using errcode = '55000';
    end if;
    if (v_table_a is null) <> (v_table_b is null) then
      raise exception 'Both participants must have an assignment in group round %', v_round using errcode = '55000';
    end if;

    if v_table_a is not null and v_table_b is not null then
      update public.session_assignments assignment
      set table_number = case assignment.participant_id
        when p_participant_a then v_table_b
        when p_participant_b then v_table_a
      end
      where assignment.match_id = p_match_id
        and assignment.event_id = p_event_id
        and assignment.round = v_round
        and assignment.participant_id in (p_participant_a, p_participant_b);
      get diagnostics v_round_updated = row_count;
      if v_round_updated <> 2 then
        raise exception 'Group assignments changed before the participant seat swap' using errcode = '55000';
      end if;
      v_updated := v_updated + v_round_updated;
    end if;

    v_table_a := null;
    v_table_b := null;
  end loop;

  if v_event_format = 'choice_only_three_groups' and v_updated <> 6 then
    raise exception 'Choice-only participant seat swaps must update exactly six assignments' using errcode = '55000';
  end if;
  if v_updated = 0 then
    raise exception 'Neither participant has a group-round assignment' using errcode = '22023';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'event_format', v_event_format,
    'rounds', pg_catalog.to_jsonb(v_rounds),
    'updated_assignments', v_updated,
    'participant_a', p_participant_a,
    'participant_b', p_participant_b
  );
end;
$$;

revoke all on function public.swap_event3_group_seats_v2(
  uuid, integer, integer, integer, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.swap_event3_group_seats_v2(
  uuid, integer, integer, integer, boolean, text
) to service_role;
