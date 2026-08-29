-- Swap complete Event3 table labels in one transaction. The v2 name makes the
-- API fail closed when this synchronization behavior has not been deployed.
create or replace function public.swap_event3_table_numbers_v2(
  p_match_id uuid,
  p_event_id integer,
  p_rounds smallint[],
  p_table_a integer,
  p_table_b integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer := 0;
  v_synced_test_results integer := 0;
begin
  if p_match_id is null or p_event_id is null or p_event_id <= 0 then
    raise exception 'A valid match and event are required';
  end if;
  if coalesce(pg_catalog.array_length(p_rounds, 1), 0) = 0
     or exists (
       select 1
       from pg_catalog.unnest(p_rounds) as requested(round_number)
       where requested.round_number not in (1, 2, 20, 30)
     ) then
    raise exception 'Rounds must contain only 1, 2, 20, or 30';
  end if;
  if p_table_a is null or p_table_b is null
     or p_table_a <= 0 or p_table_b <= 0
     or p_table_a > 99 or p_table_b > 99
     or p_table_a = p_table_b then
    raise exception 'Two different table numbers between 1 and 99 are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':tables', 0)
  );

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
  -- isolated admin result modal. Keep that duplicate in sync inside this same
  -- transaction so a successful swap can never leave test results stale.
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
    'updated_assignments', v_updated,
    'synced_test_results', v_synced_test_results,
    'table_a', p_table_a,
    'table_b', p_table_b,
    'rounds', pg_catalog.to_jsonb(p_rounds)
  );
end;
$$;

revoke all on function public.swap_event3_table_numbers_v2(uuid, integer, smallint[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.swap_event3_table_numbers_v2(uuid, integer, smallint[], integer, integer)
  to service_role;
