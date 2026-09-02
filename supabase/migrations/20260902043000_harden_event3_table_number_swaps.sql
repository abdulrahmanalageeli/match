-- Table-label swaps share the Event3 runtime lock with seating approval and
-- compare the exact active live/test session before writing. Replacing the old
-- five-argument signature makes older deployments fail closed when the API
-- starts sending the CAS arguments.
revoke all on function public.swap_event3_table_numbers_v2(uuid, integer, smallint[], integer, integer)
  from public, anon, authenticated, service_role;
drop function public.swap_event3_table_numbers_v2(uuid, integer, smallint[], integer, integer);

create or replace function public.swap_event3_table_numbers_v2(
  p_match_id uuid,
  p_event_id integer,
  p_rounds smallint[],
  p_table_a integer,
  p_table_b integer,
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
  v_updated integer := 0;
  v_synced_test_results integer := 0;
begin
  if p_match_id is null or p_event_id is null or p_event_id <= 0 then
    raise exception 'A valid match and event are required' using errcode = '22023';
  end if;
  if p_expected_test_mode is null then
    raise exception 'The expected Event3 test-mode state is required' using errcode = '22023';
  end if;
  if p_table_a is null or p_table_b is null
     or p_table_a <= 0 or p_table_b <= 0
     or p_table_a > 99 or p_table_b > 99
     or p_table_a = p_table_b then
    raise exception 'Two different table numbers between 1 and 99 are required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );

  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Table numbers can only be changed for the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from p_expected_test_mode
     or (p_expected_test_mode and
       (v_state.test_mode_snapshot ->> 'started_at') is distinct from p_expected_started_at) then
    raise exception 'The Event3 live/test session changed before the table swap' using errcode = '55000';
  end if;

  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = p_match_id and settings.event_id = p_event_id;

  if v_event_format = 'choice_only_three_groups' then
    if p_rounds is distinct from array[1, 2, 3]::smallint[]
       and p_rounds is distinct from array[20]::smallint[]
       and p_rounds is distinct from array[30]::smallint[] then
      raise exception 'Choice-only table swaps must target group rounds 1, 2, and 3 together, or exactly round 20 or 30' using errcode = '22023';
    end if;
  elsif p_rounds is distinct from array[1, 2]::smallint[]
        and p_rounds is distinct from array[20]::smallint[]
        and p_rounds is distinct from array[30]::smallint[] then
    raise exception 'Classic table swaps must target group rounds 1 and 2 together, or exactly round 20 or 30' using errcode = '22023';
  end if;

  update public.session_assignments
  set table_number = case table_number
    when p_table_a then p_table_b
    when p_table_b then p_table_a
  end
  where match_id = p_match_id
    and event_id = p_event_id
    and round = any(p_rounds)
    and table_number in (p_table_a, p_table_b);
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Neither table exists in the requested round(s)';
  end if;

  -- Test-mode algorithm results duplicate the round-30 table number for the
  -- isolated admin result modal. Keep that duplicate in this transaction.
  if 30 = any(p_rounds) then
    update public.event3_test_match_results result_row
    set table_number = (
      select pg_catalog.min(assignment.table_number)
      from public.session_assignments assignment
      where assignment.match_id = p_match_id
        and assignment.event_id = p_event_id
        and assignment.round = 30
        and assignment.participant_id in (
          result_row.participant_a_number,
          result_row.participant_b_number
        )
    )
    where result_row.match_id = p_match_id
      and result_row.event_id = p_event_id
      and exists (
        select 1
        from public.session_assignments assignment
        where assignment.match_id = p_match_id
          and assignment.event_id = p_event_id
          and assignment.round = 30
          and assignment.participant_id in (
            result_row.participant_a_number,
            result_row.participant_b_number
          )
      );
    get diagnostics v_synced_test_results = row_count;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'event_format', v_event_format,
    'updated_assignments', v_updated,
    'synced_test_results', v_synced_test_results,
    'table_a', p_table_a,
    'table_b', p_table_b,
    'rounds', pg_catalog.to_jsonb(p_rounds)
  );
end;
$$;

revoke all on function public.swap_event3_table_numbers_v2(
  uuid, integer, smallint[], integer, integer, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.swap_event3_table_numbers_v2(
  uuid, integer, smallint[], integer, integer, boolean, text
) to service_role;
