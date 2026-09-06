-- Apply a complete reviewed Round-3 seating map without rewriting the first
-- two group rounds. The expected map is a compare-and-swap guard: an admin
-- cannot apply a plan after another operator changes the live seating.
create or replace function public.apply_event3_round3_seating_plan_v2(
  p_match_id uuid,
  p_static_match_id uuid,
  p_event_id integer,
  p_expected_round1_assignments jsonb,
  p_expected_round2_assignments jsonb,
  p_expected_assignments jsonb,
  p_assignments jsonb,
  p_frozen_table integer,
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
  v_roster_count integer;
  v_updated integer := 0;
  v_moved integer := 0;
begin
  if p_match_id is null or p_static_match_id is null
     or p_event_id is null or p_event_id <= 0 then
    raise exception 'A valid match and event are required' using errcode = '22023';
  end if;
  if p_expected_test_mode is null then
    raise exception 'The expected Event3 test-mode state is required' using errcode = '22023';
  end if;
  if p_frozen_table is null or p_frozen_table <= 0 or p_frozen_table > 99 then
    raise exception 'The frozen table must be between 1 and 99' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_expected_round1_assignments) is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_expected_round2_assignments) is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_expected_assignments) is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'Expected Round 1-3 and proposed Round-3 assignments must be JSON arrays' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_expected_round1_assignments) item
    where pg_catalog.jsonb_typeof(item) <> 'object'
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_expected_round2_assignments) item
    where pg_catalog.jsonb_typeof(item) <> 'object'
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_expected_assignments) item
    where pg_catalog.jsonb_typeof(item) <> 'object'
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_assignments) item
    where pg_catalog.jsonb_typeof(item) <> 'object'
  ) then
    raise exception 'Every Round-3 assignment must be a JSON object' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );

  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  if not found
     or v_state.current_event_id is distinct from p_event_id
     or v_state.phase is distinct from 'setup'
     or coalesce(v_state.global_timer_active, false)
     or coalesce(v_state.groups_locked, false) then
    raise exception 'Round-3 seating apply requires the active unlocked setup event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from p_expected_test_mode
     or (p_expected_test_mode and
       (v_state.test_mode_snapshot ->> 'started_at') is distinct from p_expected_started_at) then
    raise exception 'The Event3 live/test session changed before the Round-3 seating apply' using errcode = '55000';
  end if;
  if coalesce((select settings.event_format
      from public.event3_event_settings settings
      where settings.match_id = p_match_id and settings.event_id = p_event_id), 'classic')
      <> 'choice_only_three_groups' then
    raise exception 'Round-3 seating apply requires the choice-only three-group format' using errcode = '22023';
  end if;

  -- Block legacy row updates while validating the exact read snapshot, and
  -- prevent protected/excluded-pair phantoms until the transaction commits.
  lock table public.session_assignments in share row exclusive mode;
  lock table public.event3_participants, public.participants, public.locked_matches,
    public.event3_exclusions in share mode;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_expected_round1_assignments)
      as expected(participant_id integer, table_number integer)
    where expected.participant_id is null or expected.participant_id <= 0
      or expected.participant_id = 9999
      or expected.table_number is null or expected.table_number <= 0
      or expected.table_number > 99
  ) or exists (
    select expected.participant_id
    from pg_catalog.jsonb_to_recordset(p_expected_round1_assignments)
      as expected(participant_id integer)
    group by expected.participant_id having count(*) <> 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_expected_round2_assignments)
      as expected(participant_id integer, table_number integer)
    where expected.participant_id is null or expected.participant_id <= 0
      or expected.participant_id = 9999
      or expected.table_number is null or expected.table_number <= 0
      or expected.table_number > 99
  ) or exists (
    select expected.participant_id
    from pg_catalog.jsonb_to_recordset(p_expected_round2_assignments)
      as expected(participant_id integer)
    group by expected.participant_id having count(*) <> 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_expected_assignments)
      as expected(participant_id integer, table_number integer)
    where expected.participant_id is null or expected.participant_id <= 0
      or expected.participant_id = 9999
      or expected.table_number is null or expected.table_number <= 0
      or expected.table_number > 99
  ) or exists (
    select expected.participant_id
    from pg_catalog.jsonb_to_recordset(p_expected_assignments)
      as expected(participant_id integer)
    group by expected.participant_id having count(*) <> 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_assignments)
      as proposed(participant_id integer, table_number integer)
    where proposed.participant_id is null or proposed.participant_id <= 0
      or proposed.participant_id = 9999
      or proposed.table_number is null or proposed.table_number <= 0
      or proposed.table_number > 99
  ) or exists (
    select proposed.participant_id
    from pg_catalog.jsonb_to_recordset(p_assignments)
      as proposed(participant_id integer)
    group by proposed.participant_id having count(*) <> 1
  ) then
    raise exception 'Expected Round 1-3 or proposed Round-3 assignments contain invalid or duplicate participants/tables' using errcode = '22023';
  end if;

  select count(*) into v_roster_count
  from public.event3_participants participant
  where participant.match_id = p_match_id and participant.event_id = p_event_id;
  if v_roster_count <= 0 then
    raise exception 'The active Event3 roster is empty' using errcode = '55000';
  end if;
  if pg_catalog.jsonb_array_length(p_expected_round1_assignments) <> v_roster_count
     or pg_catalog.jsonb_array_length(p_expected_round2_assignments) <> v_roster_count
     or pg_catalog.jsonb_array_length(p_expected_assignments) <> v_roster_count
     or pg_catalog.jsonb_array_length(p_assignments) <> v_roster_count then
    raise exception 'Expected Round 1-3 and proposed Round-3 maps must contain every roster participant exactly once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.event3_participants roster
    where roster.match_id = p_match_id and roster.event_id = p_event_id
      and not exists (
        select 1 from pg_catalog.jsonb_to_recordset(p_assignments)
          as proposed(participant_id integer)
        where proposed.participant_id = roster.participant_number
      )
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_assignments)
      as proposed(participant_id integer)
    where not exists (
      select 1 from public.event3_participants roster
      where roster.match_id = p_match_id and roster.event_id = p_event_id
        and roster.participant_number = proposed.participant_id
    )
  ) then
    raise exception 'The proposed Round-3 map must match the active roster exactly' using errcode = '22023';
  end if;

  -- Fail closed if either history round is incomplete: missing rows would make
  -- the repeat-pair validation incorrectly permissive.
  if exists (
    select requested.round_number
    from (values (1::smallint), (2::smallint)) requested(round_number)
    where (select count(*) from public.session_assignments assignment
      where assignment.match_id = p_match_id and assignment.event_id = p_event_id
        and assignment.round = requested.round_number) <> v_roster_count
      or exists (
        select 1 from public.event3_participants roster
        where roster.match_id = p_match_id and roster.event_id = p_event_id
          and not exists (
            select 1 from public.session_assignments assignment
            where assignment.match_id = p_match_id and assignment.event_id = p_event_id
              and assignment.round = requested.round_number
              and assignment.participant_id = roster.participant_number
          )
      )
  ) then
    raise exception 'Rounds 1 and 2 must each contain the complete active roster' using errcode = '55000';
  end if;

  -- Compare both reviewed history maps, not only their row counts. The repeat
  -- proof is invalid if any earlier table changes after the plan is reviewed.
  if exists (
    select 1
    from (values
      (1::smallint, p_expected_round1_assignments),
      (2::smallint, p_expected_round2_assignments)
    ) baseline(round_number, assignments)
    where coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'participant_id', current_assignment.participant_id,
        'table_number', current_assignment.table_number
      ) order by current_assignment.participant_id)
      from public.session_assignments current_assignment
      where current_assignment.match_id = p_match_id
        and current_assignment.event_id = p_event_id
        and current_assignment.round = baseline.round_number
    ), '[]'::jsonb) is distinct from coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'participant_id', expected.participant_id,
        'table_number', expected.table_number
      ) order by expected.participant_id)
      from pg_catalog.jsonb_to_recordset(baseline.assignments)
        as expected(participant_id integer, table_number integer)
    ), '[]'::jsonb)
  ) then
    raise exception 'Round 1 or 2 seating changed after this plan was reviewed' using errcode = '55000';
  end if;

  if coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'participant_id', current_assignment.participant_id,
      'table_number', current_assignment.table_number
    ) order by current_assignment.participant_id)
    from public.session_assignments current_assignment
    where current_assignment.match_id = p_match_id
      and current_assignment.event_id = p_event_id
      and current_assignment.round = 3
  ), '[]'::jsonb) is distinct from coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'participant_id', expected.participant_id,
      'table_number', expected.table_number
    ) order by expected.participant_id)
    from pg_catalog.jsonb_to_recordset(p_expected_assignments)
      as expected(participant_id integer, table_number integer)
  ), '[]'::jsonb) then
    raise exception 'Round-3 seating changed after this plan was reviewed' using errcode = '55000';
  end if;

  -- Preserve the exact current capacity of every table. This supports both
  -- six-person tables and the flexible 44-person layout without hardcoding a
  -- roster size or table count.
  if exists (
    with current_capacities as (
      select current_assignment.table_number, count(*)::integer as capacity
      from public.session_assignments current_assignment
      where current_assignment.match_id = p_match_id
        and current_assignment.event_id = p_event_id
        and current_assignment.round = 3
      group by current_assignment.table_number
    ), proposed_capacities as (
      select proposed.table_number, count(*)::integer as capacity
      from pg_catalog.jsonb_to_recordset(p_assignments)
        as proposed(participant_id integer, table_number integer)
      group by proposed.table_number
    )
    select 1 from (
      (select * from current_capacities except select * from proposed_capacities)
      union all
      (select * from proposed_capacities except select * from current_capacities)
    ) changed_capacity
  ) then
    raise exception 'The proposed Round-3 map changes table capacities' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.session_assignments current_assignment
    where current_assignment.match_id = p_match_id
      and current_assignment.event_id = p_event_id
      and current_assignment.round = 3
      and current_assignment.table_number = p_frozen_table
  ) then
    raise exception 'The frozen Round-3 table does not exist' using errcode = '22023';
  end if;
  if exists (
    with current_members as (
      select current_assignment.participant_id
      from public.session_assignments current_assignment
      where current_assignment.match_id = p_match_id
        and current_assignment.event_id = p_event_id
        and current_assignment.round = 3
        and current_assignment.table_number = p_frozen_table
    ), proposed_members as (
      select proposed.participant_id
      from pg_catalog.jsonb_to_recordset(p_assignments)
        as proposed(participant_id integer, table_number integer)
      where proposed.table_number = p_frozen_table
    )
    select 1 from (
      (select * from current_members except select * from proposed_members)
      union all
      (select * from proposed_members except select * from current_members)
    ) changed_frozen_member
  ) then
    raise exception 'The proposed Round-3 map changes the frozen table' using errcode = '22023';
  end if;

  -- When the roster is exactly 22 women/22 men, the flexible generator has a
  -- hard balanced-44 contract. Recheck that structure against locked database
  -- profiles instead of trusting the API's reviewed target: two 7-seat tables
  -- (3/4) and five 6-seat tables (3/3). Other gender distributions keep the
  -- general capacity/no-repeat safeguards used by the flexible fallback.
  if v_roster_count = 44 and coalesce((
      with profile_genders as (
        select roster.participant_number,
          case
            when pg_catalog.lower(pg_catalog.btrim(coalesce(profile.gender, ''))) like 'f%'
              or pg_catalog.btrim(coalesce(profile.gender, '')) in ('أنثى', 'انثى') then 'female'
            when pg_catalog.lower(pg_catalog.btrim(coalesce(profile.gender, ''))) like 'm%'
              or pg_catalog.btrim(coalesce(profile.gender, '')) = 'ذكر' then 'male'
            else 'unknown'
          end as gender
        from public.event3_participants roster
        left join public.participants profile
          on profile.match_id = p_static_match_id
          and profile.assigned_number = roster.participant_number
        where roster.match_id = p_match_id and roster.event_id = p_event_id
      )
      select count(*) = 44
        and count(*) filter (where gender = 'female') = 22
        and count(*) filter (where gender = 'male') = 22
      from profile_genders
    ), false) then
    if not coalesce((
      with proposed_capacities as (
        select proposed.table_number, count(*)::integer as capacity
        from pg_catalog.jsonb_to_recordset(p_assignments)
          as proposed(participant_id integer, table_number integer)
        group by proposed.table_number
      )
      select count(*) = 7
        and count(*) filter (where capacity = 7) = 2
        and count(*) filter (where capacity = 6) = 5
      from proposed_capacities
    ), false) then
      raise exception 'Balanced 44-person seating requires two 7-seat and five 6-seat tables' using errcode = '22023';
    end if;

    if exists (
      with profile_genders as (
        select roster.participant_number,
          case
            when pg_catalog.lower(pg_catalog.btrim(coalesce(profile.gender, ''))) like 'f%'
              or pg_catalog.btrim(coalesce(profile.gender, '')) in ('أنثى', 'انثى') then 'female'
            when pg_catalog.lower(pg_catalog.btrim(coalesce(profile.gender, ''))) like 'm%'
              or pg_catalog.btrim(coalesce(profile.gender, '')) = 'ذكر' then 'male'
            else 'unknown'
          end as gender
        from public.event3_participants roster
        left join public.participants profile
          on profile.match_id = p_static_match_id
          and profile.assigned_number = roster.participant_number
        where roster.match_id = p_match_id and roster.event_id = p_event_id
      ), proposed as (
        select assignment.participant_id, assignment.table_number, profile.gender
        from pg_catalog.jsonb_to_recordset(p_assignments)
          as assignment(participant_id integer, table_number integer)
        join profile_genders profile
          on profile.participant_number = assignment.participant_id
      )
      select proposed.table_number
      from proposed
      group by proposed.table_number
      having (count(*) = 6 and (
          count(*) filter (where proposed.gender = 'female') <> 3
          or count(*) filter (where proposed.gender = 'male') <> 3
        ))
        or (count(*) = 7 and not (
          count(*) filter (where proposed.gender = 'female') in (3, 4)
          and count(*) filter (where proposed.gender = 'male') in (3, 4)
        ))
    ) then
      raise exception 'Every table in a balanced 44-person Round-3 plan must have a 3/3 or 3/4 gender split' using errcode = '22023';
    end if;
  end if;

  if exists (
    with proposed as (
      select row_data.participant_id, row_data.table_number
      from pg_catalog.jsonb_to_recordset(p_assignments)
        as row_data(participant_id integer, table_number integer)
    )
    select 1
    from proposed left_participant
    join proposed right_participant
      on right_participant.table_number = left_participant.table_number
      and right_participant.participant_id > left_participant.participant_id
    where left_participant.table_number <> p_frozen_table
      and exists (
        select 1
        from public.session_assignments left_history
        join public.session_assignments right_history
          on right_history.match_id = left_history.match_id
          and right_history.event_id = left_history.event_id
          and right_history.round = left_history.round
          and right_history.table_number = left_history.table_number
        where left_history.match_id = p_match_id
          and left_history.event_id = p_event_id
          and left_history.round in (1, 2)
          and left_history.participant_id = left_participant.participant_id
          and right_history.participant_id = right_participant.participant_id
      )
  ) then
    raise exception 'The proposed Round-3 map repeats an earlier encounter outside the frozen table' using errcode = '22023';
  end if;

  if exists (
    with proposed as (
      select row_data.participant_id, row_data.table_number
      from pg_catalog.jsonb_to_recordset(p_assignments)
        as row_data(participant_id integer, table_number integer)
    ), forbidden as (
      select least(locked.participant1_number, locked.participant2_number) as participant_a,
        greatest(locked.participant1_number, locked.participant2_number) as participant_b
      from public.locked_matches locked
      where locked.match_id = p_static_match_id and locked.event_id = p_event_id
      union
      select least(excluded.participant_a_number, excluded.participant_b_number),
        greatest(excluded.participant_a_number, excluded.participant_b_number)
      from public.event3_exclusions excluded
      where excluded.match_id = p_match_id and excluded.event_id = p_event_id
    )
    select 1
    from proposed left_participant
    join proposed right_participant
      on right_participant.table_number = left_participant.table_number
      and right_participant.participant_id > left_participant.participant_id
    join forbidden pair
      on pair.participant_a = left_participant.participant_id
      and pair.participant_b = right_participant.participant_id
  ) then
    raise exception 'The proposed Round-3 map contains a protected or excluded pair' using errcode = '22023';
  end if;

  select count(*) into v_moved
  from public.session_assignments current_assignment
  join pg_catalog.jsonb_to_recordset(p_assignments)
    as proposed(participant_id integer, table_number integer)
    on proposed.participant_id = current_assignment.participant_id
  where current_assignment.match_id = p_match_id
    and current_assignment.event_id = p_event_id
    and current_assignment.round = 3
    and current_assignment.table_number is distinct from proposed.table_number;

  update public.session_assignments current_assignment
  set table_number = proposed.table_number
  from pg_catalog.jsonb_to_recordset(p_assignments)
    as proposed(participant_id integer, table_number integer)
  where current_assignment.match_id = p_match_id
    and current_assignment.event_id = p_event_id
    and current_assignment.round = 3
    and current_assignment.participant_id = proposed.participant_id;
  get diagnostics v_updated = row_count;
  if v_updated <> v_roster_count then
    raise exception 'Round-3 assignments changed during the atomic apply' using errcode = '55000';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'round', 3,
    'frozen_table', p_frozen_table,
    'updated_assignments', v_updated,
    'moved_assignments', v_moved
  );
end;
$$;

revoke all on function public.apply_event3_round3_seating_plan_v2(
  uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, integer, boolean, text
) from PUBLIC, anon, authenticated, service_role;
grant execute on function public.apply_event3_round3_seating_plan_v2(
  uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb, integer, boolean, text
) to service_role;
