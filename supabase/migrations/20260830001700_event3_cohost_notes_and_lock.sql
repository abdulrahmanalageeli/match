-- Fail quickly if the live event is busy instead of waiting on an event lock.
set local lock_timeout = '5s';

alter table public.event_state
  add column if not exists cohost_locked boolean not null default false,
  add column if not exists cohost_lock_updated_at timestamptz,
  add column if not exists cohost_lock_updated_by text;

comment on column public.event_state.cohost_locked is
  'Temporarily blocks Event3 co-host login and every co-host API action.';

create table if not exists public.event3_cohost_notes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  event_id integer not null check (event_id > 0),
  test_mode boolean not null default false,
  test_session_key text not null default '',
  scope_type text not null check (scope_type in ('event', 'table', 'participant', 'pair')),
  scope_key text not null check (char_length(scope_key) between 3 and 120),
  round smallint check (round in (1, 2, 3, 20, 30)),
  table_number integer check (table_number > 0),
  participant_number integer check (participant_number > 0),
  participant2_number integer check (participant2_number > 0),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  updated_by text not null default 'event3-cohost',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event3_cohost_notes_scope_unique unique (match_id, event_id, test_mode, test_session_key, scope_key),
  constraint event3_cohost_notes_scope_shape check (
    (
      scope_type = 'event'
      and round is null
      and table_number is null
      and participant_number is null
      and participant2_number is null
    )
    or (
      scope_type = 'table'
      and round is not null
      and table_number is not null
      and participant_number is null
      and participant2_number is null
    )
    or (
      scope_type = 'participant'
      and round is null
      and table_number is null
      and participant_number is not null
      and participant2_number is null
    )
    or (
      scope_type = 'pair'
      and round in (20, 30)
      and table_number is null
      and participant_number is not null
      and participant2_number is not null
      and participant_number < participant2_number
    )
  )
);

create index if not exists event3_cohost_notes_event_updated_idx
  on public.event3_cohost_notes (match_id, event_id, test_mode, test_session_key, updated_at desc);

alter table public.event3_cohost_notes enable row level security;

revoke all on table public.event3_cohost_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.event3_cohost_notes to service_role;

comment on table public.event3_cohost_notes is
  'Private operational notes for Event3 co-hosts. Only server-side service-role APIs may access these rows.';

-- Test-only preparation. External scoring happens before these short
-- transactions; every lifecycle write uses the existing start/end lock.
create or replace function public.assert_event3_prepared_test_algorithm(
  p_event_id integer,
  p_expected_started_at text,
  p_participant_numbers integer[],
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_roster integer[];
  v_expected integer[];
  v_incoming integer[];
  v_item jsonb;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive test event id is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0));
  select state.* into v_state from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid for update;
  if not found or v_state.test_mode_active is not true or v_state.current_event_id is distinct from p_event_id
    or (v_state.test_mode_snapshot ->> 'started_at') is distinct from p_expected_started_at then
    raise exception 'The active test session changed; nothing was modified';
  end if;

  -- Block roster/exclusion phantoms while validating and activating. No AI or
  -- network work is done while these transaction-scoped locks are held.
  lock table public.event3_participants, public.event3_exclusions in share mode;
  select pg_catalog.array_agg(participant_number order by participant_number) into v_roster
  from public.event3_participants
  where match_id = v_state.match_id and event_id = p_event_id;
  select pg_catalog.array_agg(number order by number) into v_expected
  from pg_catalog.unnest(p_participant_numbers) as selected(number);
  if coalesce(pg_catalog.cardinality(v_roster), 0) < 4 or pg_catalog.cardinality(v_roster) % 2 <> 0
    or v_roster is distinct from v_expected then
    raise exception 'The test participant roster changed or is incomplete';
  end if;
  if pg_catalog.jsonb_typeof(p_rows) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_rows) * 2 <> pg_catalog.cardinality(v_roster) then
    raise exception 'Prepared test pairs must cover the complete roster';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_rows) as pair(participant_a_number integer, participant_b_number integer)
    where pair.participant_a_number is null or pair.participant_b_number is null
      or pair.participant_a_number <= 0 or pair.participant_a_number >= pair.participant_b_number
  ) then raise exception 'Prepared test pairs must be distinct canonical participant pairs'; end if;
  select pg_catalog.array_agg(number order by number) into v_incoming from (
    select pair.participant_a_number as number from pg_catalog.jsonb_to_recordset(p_rows) as pair(participant_a_number integer)
    union all
    select pair.participant_b_number as number from pg_catalog.jsonb_to_recordset(p_rows) as pair(participant_b_number integer)
  ) incoming;
  if v_incoming is distinct from v_roster then
    raise exception 'Prepared test pairs contain missing, duplicate, or outside-roster participants';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_rows) as pair(participant_a_number integer, participant_b_number integer)
    join public.event3_exclusions excluded on excluded.match_id = v_state.match_id and excluded.event_id = p_event_id
      and least(excluded.participant_a_number, excluded.participant_b_number) = pair.participant_a_number
      and greatest(excluded.participant_a_number, excluded.participant_b_number) = pair.participant_b_number
  ) then raise exception 'A prepared test pair is now excluded; nothing was modified'; end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_rows) loop
    if v_item ->> 'match_id' is distinct from v_state.match_id::text
      or (v_item ->> 'event_id')::integer is distinct from p_event_id
      or (v_item ->> 'round')::integer is distinct from 30
      or v_item ->> 'match_type' is distinct from 'individual'
      or v_item ->> 'score_model_version' is distinct from '2026-08-25-v7-balanced-100'
      or pg_catalog.jsonb_typeof(v_item -> 'score_snapshot') is distinct from 'object'
      or nullif(v_item ->> 'score_content_hash', '') is null
      or v_item -> 'score_snapshot' ->> 'scoreModelVersion' is distinct from v_item ->> 'score_model_version'
      or v_item -> 'score_snapshot' ->> 'combinedContentHash' is distinct from v_item ->> 'score_content_hash'
      or pg_catalog.jsonb_typeof(v_item -> 'score_snapshot' -> 'scoreBreakdown') is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_item -> 'score_snapshot' -> 'questionScores') is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_item -> 'score_snapshot' -> 'vibeAxes') is distinct from 'object'
      or v_item -> 'score_snapshot' ->> 'vibeModel' is distinct from 'gpt-5.4-mini'
      or v_item -> 'score_snapshot' ->> 'vibeModelVersion' is distinct from 'balanced-vibe12-v1'
      or v_item -> 'score_snapshot' ->> 'vibeModelTag' is distinct from 'gpt-5.4-mini|balanced-vibe12-v1'
      or pg_catalog.jsonb_typeof(v_item -> 'score_snapshot' -> 'totalScore') is distinct from 'number'
      or pg_catalog.jsonb_typeof(v_item -> 'compatibility_score') is distinct from 'number'
      or (v_item -> 'score_snapshot' ->> 'totalScore')::numeric is distinct from (v_item ->> 'compatibility_score')::numeric then
      raise exception 'Prepared test pairs require complete current-model score snapshots';
    end if;
  end loop;
  return pg_catalog.jsonb_array_length(p_rows);
end;
$$;

create or replace function public.begin_event3_test_mode_with_prepared_algorithm(
  p_event_id integer, p_participant_numbers integer[], p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_started jsonb;
  v_started_at text;
  v_count integer;
begin
  v_started := public.begin_event3_test_mode_with_group_feedback(p_event_id, p_participant_numbers);
  select test_mode_snapshot ->> 'started_at' into v_started_at from public.event_state
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid;
  perform public.assert_event3_prepared_test_algorithm(p_event_id, v_started_at, p_participant_numbers, p_rows);
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_rows) row_data where row_data ->> 'table_number' is not null) then
    raise exception 'Prepared test pairs cannot assign phase-3 tables before activation';
  end if;
  v_count := public.replace_event3_test_match_results(p_event_id, p_rows);
  return v_started || pg_catalog.jsonb_build_object('prepared_algorithm_pairs', v_count);
end;
$$;

create or replace function public.prepare_event3_test_algorithm_if_empty(
  p_event_id integer, p_expected_started_at text, p_participant_numbers integer[], p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0));
  perform 1 from public.event_state where match_id = '00000000-0000-0000-0000-000000000003'::uuid for update;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data)), '[]'::jsonb) into v_existing
  from public.event3_test_match_results row_data
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  if pg_catalog.jsonb_array_length(v_existing) > 0 then
    v_count := public.assert_event3_prepared_test_algorithm(p_event_id, p_expected_started_at, p_participant_numbers, v_existing);
    return pg_catalog.jsonb_build_object('prepared_algorithm_pairs', v_count, 'reused', true);
  end if;
  perform public.assert_event3_prepared_test_algorithm(p_event_id, p_expected_started_at, p_participant_numbers, p_rows);
  if exists (select 1 from public.event3_matches where match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and event_id = p_event_id and phase3_partner is not null) then
    raise exception 'Phase 3 already contains matches; restart test mode before preparing a new plan';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_rows) row_data where row_data ->> 'table_number' is not null) then
    raise exception 'Prepared test pairs cannot assign phase-3 tables before activation';
  end if;
  v_count := public.replace_event3_test_match_results(p_event_id, p_rows);
  return pg_catalog.jsonb_build_object('prepared_algorithm_pairs', v_count, 'reused', false);
end;
$$;

create or replace function public.activate_event3_prepared_test_algorithm(
  p_event_id integer, p_expected_started_at text, p_participant_numbers integer[], p_table_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_count integer;
  v_match_id constant uuid := '00000000-0000-0000-0000-000000000003'::uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0));
  perform 1 from public.event_state where match_id = v_match_id for update;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data)), '[]'::jsonb) into v_rows
  from public.event3_test_match_results row_data where match_id = v_match_id and event_id = p_event_id;
  v_count := public.assert_event3_prepared_test_algorithm(p_event_id, p_expected_started_at, p_participant_numbers, v_rows);
  if pg_catalog.jsonb_typeof(p_table_plan) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_table_plan) <> v_count then
    raise exception 'Every prepared test pair requires one physical table';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_table_plan) plan(a integer, b integer, "table" integer)
    where plan.a is null or plan.b is null or plan."table" is null or plan."table" <= 0
      or not exists (select 1 from public.event3_test_match_results prepared where prepared.match_id = v_match_id
        and prepared.event_id = p_event_id and prepared.participant_a_number = least(plan.a, plan.b)
        and prepared.participant_b_number = greatest(plan.a, plan.b))
  ) or (select pg_catalog.count(distinct plan."table") from pg_catalog.jsonb_to_recordset(p_table_plan) plan("table" integer)) <> v_count
    or (select pg_catalog.count(distinct (least(plan.a, plan.b), greatest(plan.a, plan.b)))
      from pg_catalog.jsonb_to_recordset(p_table_plan) plan(a integer, b integer)) <> v_count then
    raise exception 'Phase-3 tables must contain exactly the prepared test pairs';
  end if;
  if exists (
    select 1 from public.event3_matches runtime where runtime.match_id = v_match_id and runtime.event_id = p_event_id
      and runtime.phase3_partner is not null and not exists (
        select 1 from public.event3_test_match_results prepared where prepared.match_id = v_match_id and prepared.event_id = p_event_id
          and prepared.participant_a_number = least(runtime.participant_number, runtime.phase3_partner)
          and prepared.participant_b_number = greatest(runtime.participant_number, runtime.phase3_partner)
      )
  ) then raise exception 'Existing phase-3 matches conflict with the prepared test plan'; end if;

  insert into public.event3_matches (match_id, event_id, participant_number, phase3_partner, phase3_score,
    phase3_score_model_version, phase3_score_snapshot, phase3_score_content_hash)
  select v_match_id, p_event_id, side.participant_number, side.partner_number, prepared.compatibility_score,
    prepared.score_model_version, prepared.score_snapshot, prepared.score_content_hash
  from public.event3_test_match_results prepared
  cross join lateral (values (prepared.participant_a_number, prepared.participant_b_number),
    (prepared.participant_b_number, prepared.participant_a_number)) as side(participant_number, partner_number)
  where prepared.match_id = v_match_id and prepared.event_id = p_event_id
  on conflict (match_id, event_id, participant_number) do update set
    phase3_partner = excluded.phase3_partner, phase3_score = excluded.phase3_score,
    phase3_score_model_version = excluded.phase3_score_model_version,
    phase3_score_snapshot = excluded.phase3_score_snapshot, phase3_score_content_hash = excluded.phase3_score_content_hash;

  delete from public.session_assignments where match_id = v_match_id and event_id = p_event_id and round = 30;
  insert into public.session_assignments (match_id, event_id, round, table_number, participant_id)
  select v_match_id, p_event_id, 30, plan."table", side.participant_number
  from pg_catalog.jsonb_to_recordset(p_table_plan) plan(a integer, b integer, "table" integer)
  cross join lateral (values (plan.a), (plan.b)) as side(participant_number);
  update public.event3_test_match_results prepared set table_number = plan."table"
  from pg_catalog.jsonb_to_recordset(p_table_plan) plan(a integer, b integer, "table" integer)
  where prepared.match_id = v_match_id and prepared.event_id = p_event_id
    and prepared.participant_a_number = least(plan.a, plan.b) and prepared.participant_b_number = greatest(plan.a, plan.b);
  return pg_catalog.jsonb_build_object('prepared_algorithm_pairs', v_count);
end;
$$;

revoke execute on function public.assert_event3_prepared_test_algorithm(integer, text, integer[], jsonb) from public, anon, authenticated;
revoke execute on function public.begin_event3_test_mode_with_prepared_algorithm(integer, integer[], jsonb) from public, anon, authenticated;
revoke execute on function public.prepare_event3_test_algorithm_if_empty(integer, text, integer[], jsonb) from public, anon, authenticated;
revoke execute on function public.activate_event3_prepared_test_algorithm(integer, text, integer[], jsonb) from public, anon, authenticated;
grant execute on function public.assert_event3_prepared_test_algorithm(integer, text, integer[], jsonb) to service_role;
grant execute on function public.begin_event3_test_mode_with_prepared_algorithm(integer, integer[], jsonb) to service_role;
grant execute on function public.prepare_event3_test_algorithm_if_empty(integer, text, integer[], jsonb) to service_role;
grant execute on function public.activate_event3_prepared_test_algorithm(integer, text, integer[], jsonb) to service_role;

-- Clearing test feedback must not erase the prepared algorithm plan. Serialize
-- with start/end/preparation so cleanup cannot reach a restored live runtime.
create or replace function public.clear_event3_test_data(p_event_id integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );
  select state.* into v_state from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid for update;
  if not found or v_state.current_event_id is distinct from p_event_id or v_state.test_mode_active is not true then
    raise exception 'Test data can only be cleared for the active current test event';
  end if;

  delete from public.participant_rankings where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_group_reflections where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_group_member_feedback
  where match_id = v_state.match_id and event_id = p_event_id and is_test_mode = true;
  delete from public.event3_participant_notes where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_mood_checks where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_notifications where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_ai_welcome_messages where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.organizer_requests where event_id = p_event_id;

  update public.event3_matches
  set phase2_feedback = null, phase3_feedback = null, phase2_word = null,
    phase3_word = null, match_preference = null
  where match_id = v_state.match_id and event_id = p_event_id;

  return pg_catalog.jsonb_build_object('success', true, 'event_id', p_event_id);
end;
$$;

revoke execute on function public.clear_event3_test_data(integer) from public, anon, authenticated;
grant execute on function public.clear_event3_test_data(integer) to service_role;
