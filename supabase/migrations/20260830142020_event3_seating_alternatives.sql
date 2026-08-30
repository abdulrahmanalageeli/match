create or replace function public.apply_event3_seating_alternative(
  p_match_id uuid,
  p_event_id integer,
  p_test_mode boolean,
  p_session_key text,
  p_expected jsonb,
  p_proposed jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_state public.event_state%rowtype;
  v_current jsonb;
  v_proposed jsonb;
  v_roster_count integer;
  v_updated integer;
begin
  if p_match_id is distinct from '00000000-0000-0000-0000-000000000003'::uuid
    or p_event_id is null or p_event_id <= 0 or p_test_mode is null
    or jsonb_typeof(p_expected) is distinct from 'array'
    or jsonb_typeof(p_proposed) is distinct from 'array' then
    raise exception 'Invalid seating alternative';
  end if;

  -- Share the phase/ranking lock and the existing table/group swap locks.
  perform 1 from public.event_state
  where match_id in (p_match_id, '00000000-0000-0000-0000-000000000000'::uuid)
  order by match_id for update;
  select * into v_state from public.event_state where match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id
    or v_state.phase is distinct from 'setup' or coalesce(v_state.global_timer_active, false)
    or coalesce(v_state.groups_locked, false)
    or coalesce(v_state.test_mode_active, false) is distinct from p_test_mode
    or (case when p_test_mode then coalesce(v_state.test_mode_snapshot->>'started_at', 'legacy-test') else 'live' end) is distinct from p_session_key then
    raise exception 'Event or test session changed, or groups have started';
  end if;
  if exists (select 1 from public.event_state where match_id = '00000000-0000-0000-0000-000000000000'::uuid and current_event_id is distinct from p_event_id) then
    raise exception 'Current event changed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':tables', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':group-seats', 0));
  -- Also exclude ordinary insert/delete requests which don't take advisory locks.
  lock table public.session_assignments, public.event3_participants in share row exclusive mode;
  lock table public.participant_rankings, public.event3_ranking_drafts,
    public.event3_group_member_feedback, public.event3_cohost_notes, public.event3_matches,
    public.locked_matches, public.event3_exclusions in share mode;

  if exists (select 1 from public.participant_rankings where match_id = p_match_id and event_id = p_event_id)
    or exists (select 1 from public.event3_ranking_drafts where match_id = p_match_id and event_id = p_event_id and session_key = p_session_key)
    or exists (select 1 from public.event3_group_member_feedback where match_id = p_match_id and event_id = p_event_id and is_test_mode = p_test_mode)
    or exists (select 1 from public.event3_cohost_notes where match_id = p_match_id and event_id = p_event_id and test_mode = p_test_mode and (not p_test_mode or test_session_key = coalesce(v_state.test_mode_snapshot->>'started_at', 'legacy')) and scope_type = 'table' and round in (1, 2))
    or exists (select 1 from public.event3_matches where match_id = p_match_id and event_id = p_event_id)
    or exists (select 1 from public.session_assignments where match_id = p_match_id and event_id = p_event_id and round in (20, 30)) then
    raise exception 'Existing rankings, group feedback, table notes or one-to-one sessions must be preserved';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('round', round, 'table_number', table_number, 'participant_id', participant_id) order by round, participant_id), '[]'::jsonb)
  into v_current from public.session_assignments where match_id = p_match_id and event_id = p_event_id and round in (1, 2);
  select coalesce(jsonb_agg(jsonb_build_object('round', r.round, 'table_number', r.table_number, 'participant_id', r.participant_id) order by r.round, r.participant_id), '[]'::jsonb)
  into v_proposed from jsonb_to_recordset(p_proposed) as r(round integer, table_number integer, participant_id integer);

  if v_current = v_proposed then
    return jsonb_build_object('success', true, 'already_applied', true, 'updated_assignments', 0);
  end if;
  if v_current is distinct from p_expected then raise exception 'Seating changed since this preview'; end if;
  select count(*) into v_roster_count from public.event3_participants where match_id = p_match_id and event_id = p_event_id;
  if v_roster_count < 4 or jsonb_array_length(v_proposed) <> v_roster_count * 2
    or jsonb_array_length(v_current) <> v_roster_count * 2
    or exists (
      select 1 from jsonb_to_recordset(v_proposed) as r(round integer, table_number integer, participant_id integer)
      where r.round is null or r.round not in (1, 2) or r.table_number is null or r.table_number not between 1 and 99
        or r.participant_id is null or not exists (
          select 1 from public.event3_participants p where p.match_id = p_match_id and p.event_id = p_event_id and p.participant_number = r.participant_id
        )
    ) or exists (
      select 1 from jsonb_to_recordset(v_proposed) as r(round integer, participant_id integer)
      group by r.round, r.participant_id having count(*) <> 1
    ) then raise exception 'Every current attendee must appear exactly once in each group round';
  end if;

  -- Every physical table keeps its size and gender composition, including unknowns.
  if exists (
    with plans as (
      select 'before' as plan, r.* from jsonb_to_recordset(v_current) as r(round integer, table_number integer, participant_id integer)
      union all
      select 'after', r.* from jsonb_to_recordset(v_proposed) as r(round integer, table_number integer, participant_id integer)
    ), counts as (
      select plan, round, table_number,
        case lower(trim(coalesce(nullif(p.gender, ''), p.survey_data->'answers'->>'gender', p.survey_data->>'gender', '')))
          when 'female' then 'female' when 'أنثى' then 'female' when 'انثى' then 'female'
          when 'male' then 'male' when 'ذكر' then 'male' else 'unknown' end as gender,
        count(*) as n
      from plans join public.participants p on p.assigned_number = participant_id and p.match_id = '00000000-0000-0000-0000-000000000000'::uuid
      group by 1, 2, 3, 4
    )
    select 1 from counts group by round, table_number, gender having sum(case when plan = 'before' then n else -n end) <> 0
  ) then raise exception 'Table sizes or gender counts changed'; end if;

  if exists (
    with old_rows as (select * from jsonb_to_recordset(v_current) as r(round integer, table_number integer, participant_id integer)),
    new_rows as (select * from jsonb_to_recordset(v_proposed) as r(round integer, table_number integer, participant_id integer)),
    protected as (
      select participant1_number a, participant2_number b from public.locked_matches where match_id = '00000000-0000-0000-0000-000000000000'::uuid and event_id = p_event_id
      union
      select participant_a_number, participant_b_number from public.event3_exclusions where match_id = p_match_id and event_id = p_event_id
    )
    select 1 from protected p where
      (select count(*) from new_rows a join new_rows b using (round, table_number) where a.participant_id = p.a and b.participant_id = p.b) >
      (select count(*) from old_rows a join old_rows b using (round, table_number) where a.participant_id = p.a and b.participant_id = p.b)
  ) then raise exception 'Alternative introduces an excluded or locked pair encounter'; end if;

  if (
    with rows as (select * from jsonb_to_recordset(v_current) as r(round integer, table_number integer, participant_id integer))
    select count(*) from (select a.participant_id, b.participant_id from rows a join rows b using (round, table_number)
      where a.participant_id < b.participant_id group by a.participant_id, b.participant_id having count(*) > 1) repeated
  ) <> (
    with rows as (select * from jsonb_to_recordset(v_proposed) as r(round integer, table_number integer, participant_id integer))
    select count(*) from (select a.participant_id, b.participant_id from rows a join rows b using (round, table_number)
      where a.participant_id < b.participant_id group by a.participant_id, b.participant_id having count(*) > 1) repeated
  ) then raise exception 'Repeated encounter count changed'; end if;

  update public.session_assignments a set table_number = r.table_number
  from jsonb_to_recordset(v_proposed) as r(round integer, table_number integer, participant_id integer)
  where a.match_id = p_match_id and a.event_id = p_event_id and a.round = r.round and a.participant_id = r.participant_id
    and a.table_number is distinct from r.table_number;
  get diagnostics v_updated = row_count;
  return jsonb_build_object('success', true, 'already_applied', false, 'updated_assignments', v_updated);
end;
$$;

revoke all on function public.apply_event3_seating_alternative(uuid, integer, boolean, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_event3_seating_alternative(uuid, integer, boolean, text, jsonb, jsonb) to service_role;
