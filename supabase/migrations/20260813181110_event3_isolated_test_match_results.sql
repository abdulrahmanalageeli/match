create table if not exists public.event3_test_match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null default '00000000-0000-0000-0000-000000000003'::uuid,
  event_id integer not null check (event_id > 0),
  participant_a_number integer not null check (participant_a_number > 0),
  participant_b_number integer not null check (participant_b_number > 0),
  compatibility_score numeric not null default 0,
  round smallint not null default 30,
  table_number integer,
  match_type text not null default 'individual',
  reason text,
  mbti_compatibility_score numeric not null default 0,
  attachment_compatibility_score numeric not null default 0,
  communication_compatibility_score numeric not null default 0,
  lifestyle_compatibility_score numeric not null default 0,
  core_values_compatibility_score numeric not null default 0,
  vibe_compatibility_score numeric not null default 0,
  synergy_score numeric not null default 0,
  humor_open_score numeric not null default 0,
  intent_score numeric not null default 0,
  humor_multiplier numeric not null default 1,
  attachment_penalty_applied boolean not null default false,
  intent_boost_applied boolean not null default false,
  dead_air_veto_applied boolean not null default false,
  humor_clash_veto_applied boolean not null default false,
  cap_applied numeric,
  humor_early_openness_bonus text not null default 'none',
  created_at timestamptz not null default now(),
  constraint event3_test_match_results_canonical_pair check (participant_a_number < participant_b_number),
  constraint event3_test_match_results_round check (round = 30),
  constraint event3_test_match_results_match_type check (match_type = 'individual'),
  constraint event3_test_match_results_unique_pair unique (
    match_id,
    event_id,
    round,
    participant_a_number,
    participant_b_number
  )
);

create index if not exists event3_test_match_results_event_a_idx
  on public.event3_test_match_results (match_id, event_id, participant_a_number);

create index if not exists event3_test_match_results_event_b_idx
  on public.event3_test_match_results (match_id, event_id, participant_b_number);

alter table public.event3_test_match_results enable row level security;

revoke all on table public.event3_test_match_results from anon, authenticated;
grant select, insert, update, delete on table public.event3_test_match_results to service_role;

comment on table public.event3_test_match_results is
  'Ephemeral Event3 test-mode algorithm results. Never used by real matching history or eligibility queries.';

create table if not exists public.event3_test_mode_snapshots (
  match_id uuid not null,
  event_id integer not null check (event_id > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  primary key (match_id, event_id)
);

alter table public.event3_test_mode_snapshots enable row level security;

revoke all on table public.event3_test_mode_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.event3_test_mode_snapshots to service_role;

comment on table public.event3_test_mode_snapshots is
  'Service-only pre-test Event3 runtime snapshots, deleted atomically when test mode ends.';

create or replace function public.replace_event3_test_match_results(
  p_event_id integer,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Test match rows must be a JSON array';
  end if;

  if not exists (
    select 1
    from public.event_state state
    where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and state.current_event_id = p_event_id
      and state.test_mode_active is true
  ) then
    raise exception 'Event3 test mode is not active for event %', p_event_id;
  end if;

  if exists (
    with incoming as (
      select
        least(row_data.participant_a_number, row_data.participant_b_number) as participant_a_number,
        greatest(row_data.participant_a_number, row_data.participant_b_number) as participant_b_number
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row_data(
        participant_a_number integer,
        participant_b_number integer
      )
    ), participants as (
      select participant_a_number as participant_number from incoming
      union all
      select participant_b_number as participant_number from incoming
    )
    select participant_number
    from participants
    where participant_number is not null
    group by participant_number
    having count(*) > 1
  ) then
    raise exception 'A participant cannot appear in more than one test match';
  end if;

  delete from public.event3_test_match_results
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and event_id = p_event_id;

  insert into public.event3_test_match_results (
    match_id,
    event_id,
    participant_a_number,
    participant_b_number,
    compatibility_score,
    round,
    table_number,
    match_type,
    reason,
    mbti_compatibility_score,
    attachment_compatibility_score,
    communication_compatibility_score,
    lifestyle_compatibility_score,
    core_values_compatibility_score,
    vibe_compatibility_score,
    synergy_score,
    humor_open_score,
    intent_score,
    humor_multiplier,
    attachment_penalty_applied,
    intent_boost_applied,
    dead_air_veto_applied,
    humor_clash_veto_applied,
    cap_applied,
    humor_early_openness_bonus
  )
  select
    '00000000-0000-0000-0000-000000000003'::uuid,
    p_event_id,
    least(row_data.participant_a_number, row_data.participant_b_number),
    greatest(row_data.participant_a_number, row_data.participant_b_number),
    coalesce(row_data.compatibility_score, 0),
    30,
    row_data.table_number,
    'individual',
    coalesce(row_data.reason, 'Test mode simulated algorithm lock'),
    coalesce(row_data.mbti_compatibility_score, 0),
    coalesce(row_data.attachment_compatibility_score, 0),
    coalesce(row_data.communication_compatibility_score, 0),
    coalesce(row_data.lifestyle_compatibility_score, 0),
    coalesce(row_data.core_values_compatibility_score, 0),
    coalesce(row_data.vibe_compatibility_score, 0),
    coalesce(row_data.synergy_score, 0),
    coalesce(row_data.humor_open_score, 0),
    coalesce(row_data.intent_score, 0),
    coalesce(row_data.humor_multiplier, 1),
    coalesce(row_data.attachment_penalty_applied, false),
    coalesce(row_data.intent_boost_applied, false),
    coalesce(row_data.dead_air_veto_applied, false),
    coalesce(row_data.humor_clash_veto_applied, false),
    row_data.cap_applied,
    coalesce(row_data.humor_early_openness_bonus, 'none')
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row_data(
    participant_a_number integer,
    participant_b_number integer,
    compatibility_score numeric,
    table_number integer,
    reason text,
    mbti_compatibility_score numeric,
    attachment_compatibility_score numeric,
    communication_compatibility_score numeric,
    lifestyle_compatibility_score numeric,
    core_values_compatibility_score numeric,
    vibe_compatibility_score numeric,
    synergy_score numeric,
    humor_open_score numeric,
    intent_score numeric,
    humor_multiplier numeric,
    attachment_penalty_applied boolean,
    intent_boost_applied boolean,
    dead_air_veto_applied boolean,
    humor_clash_veto_applied boolean,
    cap_applied numeric,
    humor_early_openness_bonus text
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.replace_event3_test_match_results(integer, jsonb) from public, anon, authenticated;
grant execute on function public.replace_event3_test_match_results(integer, jsonb) to service_role;

-- Test mode temporarily replaces the Event3 runtime, so its lifecycle must be
-- atomic and reversible. The full snapshot lives in a service-only table;
-- event_state contains only harmless lifecycle metadata for the admin UI.
create or replace function public.begin_event3_test_mode(
  p_event_id integer,
  p_participant_numbers integer[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_snapshot jsonb;
  v_selected_count integer;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;

  v_selected_count := coalesce(pg_catalog.array_length(p_participant_numbers, 1), 0);
  if v_selected_count <> 36
     or exists (
       select 1
       from pg_catalog.unnest(p_participant_numbers) selected(participant_number)
       where selected.participant_number is null
          or selected.participant_number <= 0
          or selected.participant_number = 9999
     )
     or (
       select pg_catalog.count(distinct selected.participant_number)
       from pg_catalog.unnest(p_participant_numbers) selected(participant_number)
     ) <> v_selected_count then
    raise exception 'Test mode requires 36 unique participant numbers';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );

  select state.*
    into v_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
  for update;

  if not found or v_state.current_event_id <> p_event_id then
    raise exception 'Event3 is not configured for event %', p_event_id;
  end if;
  if v_state.test_mode_active is true then
    raise exception 'Event3 test mode is already active';
  end if;

  v_snapshot := pg_catalog.jsonb_build_object(
    'version', 1,
    'started_at', pg_catalog.now(),
    'event_state', pg_catalog.to_jsonb(v_state),
    'event3_participants', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.position)
      from public.event3_participants row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_matches', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_matches row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'session_assignments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.session_assignments row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'participant_rankings', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.participant_rankings row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_participant_notes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_participant_notes row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_mood_checks', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_mood_checks row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_notifications', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_notifications row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_ai_welcome_messages', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_ai_welcome_messages row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event3_exclusions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_exclusions row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb)
  );

  insert into public.event3_test_mode_snapshots (
    match_id,
    event_id,
    snapshot,
    created_at
  ) values (
    v_state.match_id,
    p_event_id,
    v_snapshot,
    pg_catalog.now()
  )
  on conflict (match_id, event_id)
  do update set
    snapshot = excluded.snapshot,
    created_at = excluded.created_at;

  delete from public.event3_test_match_results
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_participant_notes
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_mood_checks
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_notifications
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_ai_welcome_messages
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.participant_rankings
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.session_assignments
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_matches
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_exclusions
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_participants
  where match_id = v_state.match_id and event_id = p_event_id;

  insert into public.event3_participants (
    match_id,
    event_id,
    participant_number,
    position
  )
  select
    v_state.match_id,
    p_event_id,
    selected.participant_number,
    selected.ordinality - 1
  from pg_catalog.unnest(p_participant_numbers) with ordinality
    selected(participant_number, ordinality);

  update public.event_state
  set phase = 'setup',
      current_round = 1,
      global_timer_active = false,
      global_timer_start_time = null,
      global_timer_duration = null,
      global_timer_round = null,
      phase2_score_revealed = false,
      phase3_score_revealed = false,
      test_mode_active = true,
      test_mode_snapshot = pg_catalog.jsonb_build_object(
        'started_at', v_snapshot -> 'started_at',
        'snapshot_version', 1
      )
  where match_id = v_state.match_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'selected_count', v_selected_count,
    'snapshot_version', 1
  );
end;
$$;

create or replace function public.end_event3_test_mode(
  p_event_id integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_snapshot jsonb;
  v_restored_participants integer := 0;
  v_legacy_cleanup boolean := false;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );

  select state.*
    into v_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
  for update;

  if not found or v_state.current_event_id <> p_event_id then
    raise exception 'Event3 is not configured for event %', p_event_id;
  end if;
  if v_state.test_mode_active is not true then
    raise exception 'Event3 test mode is not active';
  end if;

  select snapshot_row.snapshot
    into v_snapshot
  from public.event3_test_mode_snapshots snapshot_row
  where snapshot_row.match_id = v_state.match_id
    and snapshot_row.event_id = p_event_id
  for update;

  if v_snapshot is null or coalesce((v_snapshot ->> 'version')::integer, 0) <> 1 then
    if coalesce((v_state.test_mode_snapshot ->> 'snapshot_version')::integer, 0) = 1 then
      raise exception 'The pre-test Event3 snapshot is missing; test mode was left active for safe recovery';
    end if;

    -- Compatibility for a test session that was already active before this
    -- migration existed. Those legacy sessions never captured a reversible
    -- lineup, so they can only be safely cleaned up, not restored.
    v_legacy_cleanup := true;
    v_snapshot := pg_catalog.jsonb_build_object(
      'version', 1,
      'event_state', pg_catalog.jsonb_build_object(
        'phase', 'setup',
        'current_round', 1,
        'global_timer_active', false,
        'global_timer_start_time', null,
        'global_timer_duration', null,
        'global_timer_round', null,
        'phase2_score_revealed', false,
        'phase3_score_revealed', false
      ),
      'event3_participants', '[]'::jsonb,
      'event3_matches', '[]'::jsonb,
      'session_assignments', '[]'::jsonb,
      'participant_rankings', '[]'::jsonb,
      'event3_participant_notes', '[]'::jsonb,
      'event3_mood_checks', '[]'::jsonb,
      'event3_notifications', '[]'::jsonb,
      'event3_ai_welcome_messages', '[]'::jsonb,
      'event3_exclusions', '[]'::jsonb
    );
  end if;

  delete from public.event3_test_match_results
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_participant_notes
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_mood_checks
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_notifications
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_ai_welcome_messages
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.participant_rankings
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.session_assignments
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_matches
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_exclusions
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_participants
  where match_id = v_state.match_id and event_id = p_event_id;

  insert into public.event3_participants
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.event3_participants,
    coalesce(v_snapshot -> 'event3_participants', '[]'::jsonb)
  ) restored;
  get diagnostics v_restored_participants = row_count;

  insert into public.event3_matches
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.event3_matches,
    coalesce(v_snapshot -> 'event3_matches', '[]'::jsonb)
  ) restored;

  insert into public.session_assignments
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.session_assignments,
    coalesce(v_snapshot -> 'session_assignments', '[]'::jsonb)
  ) restored;

  insert into public.participant_rankings
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.participant_rankings,
    coalesce(v_snapshot -> 'participant_rankings', '[]'::jsonb)
  ) restored;

  insert into public.event3_participant_notes
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.event3_participant_notes,
    coalesce(v_snapshot -> 'event3_participant_notes', '[]'::jsonb)
  ) restored;

  insert into public.event3_mood_checks
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.event3_mood_checks,
    coalesce(v_snapshot -> 'event3_mood_checks', '[]'::jsonb)
  ) restored;

  insert into public.event3_notifications
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.event3_notifications,
    coalesce(v_snapshot -> 'event3_notifications', '[]'::jsonb)
  ) restored;

  insert into public.event3_ai_welcome_messages
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.event3_ai_welcome_messages,
    coalesce(v_snapshot -> 'event3_ai_welcome_messages', '[]'::jsonb)
  ) restored;

  insert into public.event3_exclusions
  select restored.*
  from pg_catalog.jsonb_populate_recordset(
    null::public.event3_exclusions,
    coalesce(v_snapshot -> 'event3_exclusions', '[]'::jsonb)
  ) restored;

  update public.event_state
  set phase = coalesce(v_snapshot #>> '{event_state,phase}', 'setup'),
      current_round = coalesce(nullif(v_snapshot #>> '{event_state,current_round}', '')::integer, 1),
      global_timer_active = coalesce(nullif(v_snapshot #>> '{event_state,global_timer_active}', '')::boolean, false),
      global_timer_start_time = nullif(v_snapshot #>> '{event_state,global_timer_start_time}', '')::timestamptz,
      global_timer_duration = nullif(v_snapshot #>> '{event_state,global_timer_duration}', '')::integer,
      global_timer_round = nullif(v_snapshot #>> '{event_state,global_timer_round}', '')::integer,
      phase2_score_revealed = coalesce(nullif(v_snapshot #>> '{event_state,phase2_score_revealed}', '')::boolean, false),
      phase3_score_revealed = coalesce(nullif(v_snapshot #>> '{event_state,phase3_score_revealed}', '')::boolean, false),
      test_mode_active = false,
      test_mode_snapshot = null
  where match_id = v_state.match_id;

  delete from public.event3_test_mode_snapshots
  where match_id = v_state.match_id and event_id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'restored_participants', v_restored_participants,
    'snapshot_version', 1,
    'legacy_cleanup', v_legacy_cleanup
  );
end;
$$;

revoke execute on function public.begin_event3_test_mode(integer, integer[]) from public, anon, authenticated;
revoke execute on function public.end_event3_test_mode(integer) from public, anon, authenticated;
grant execute on function public.begin_event3_test_mode(integer, integer[]) to service_role;
grant execute on function public.end_event3_test_mode(integer) to service_role;

-- Preserve the live replacement implementation, then put a test-aware wrapper
-- at its original API name. During test mode the wrapper lets the existing
-- atomic Event3 runtime swap run, but restores every normal-admin history row
-- before the transaction commits. Other sessions therefore never observe a
-- temporary participant as a real contestant or locked result.
alter function public.replace_event3_participant(uuid, uuid, integer, integer, integer, jsonb, jsonb)
  rename to replace_event3_participant_live;

create or replace function public.replace_event3_participant(
  p_event3_match_id uuid,
  p_static_match_id uuid,
  p_event_id integer,
  p_old_participant integer,
  p_new_participant integer,
  p_event_scores jsonb default '[]'::jsonb,
  p_match_result_scores jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_test_mode boolean := false;
  v_result jsonb;
  v_match_results jsonb := '[]'::jsonb;
  v_match_feedback jsonb := '[]'::jsonb;
  v_locked_matches jsonb := '[]'::jsonb;
  v_attendance jsonb := '[]'::jsonb;
  v_organizer_requests jsonb := '[]'::jsonb;
begin
  -- Serialize participant replacement with test-mode begin/end. Acquiring this
  -- before reading the flag prevents a queued swap from using stale test state
  -- after the pre-test runtime has already been restored.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );

  select coalesce(state.test_mode_active, false)
    into v_test_mode
  from public.event_state state
  where state.match_id = p_event3_match_id
    and state.current_event_id = p_event_id;

  if not coalesce(v_test_mode, false) then
    return public.replace_event3_participant_live(
      p_event3_match_id,
      p_static_match_id,
      p_event_id,
      p_old_participant,
      p_new_participant,
      p_event_scores,
      p_match_result_scores
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text), '[]'::jsonb)
    into v_match_results
  from public.match_results row_data
  where row_data.match_id = p_static_match_id
    and row_data.event_id = p_event_id
    and (
      row_data.participant_a_number in (p_old_participant, p_new_participant)
      or row_data.participant_b_number in (p_old_participant, p_new_participant)
      or row_data.participant_c_number in (p_old_participant, p_new_participant)
      or row_data.participant_d_number in (p_old_participant, p_new_participant)
      or row_data.participant_e_number in (p_old_participant, p_new_participant)
      or row_data.participant_f_number in (p_old_participant, p_new_participant)
    );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text), '[]'::jsonb)
    into v_match_feedback
  from public.match_feedback row_data
  where row_data.match_id = p_static_match_id
    and row_data.event_id = p_event_id
    and row_data.participant_number in (p_old_participant, p_new_participant);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text), '[]'::jsonb)
    into v_locked_matches
  from public.locked_matches row_data
  where row_data.match_id = p_static_match_id
    and row_data.event_id = p_event_id
    and (
      row_data.participant1_number in (p_old_participant, p_new_participant)
      or row_data.participant2_number in (p_old_participant, p_new_participant)
    );

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.participant_number), '[]'::jsonb)
    into v_attendance
  from public.event_attendance row_data
  where row_data.match_id = p_static_match_id
    and row_data.event_id = p_event_id
    and row_data.participant_number in (p_old_participant, p_new_participant);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text), '[]'::jsonb)
    into v_organizer_requests
  from public.organizer_requests row_data
  where row_data.event_id = p_event_id
    and row_data.participant_number in (p_old_participant, p_new_participant);

  v_result := public.replace_event3_participant_live(
    p_event3_match_id,
    p_static_match_id,
    p_event_id,
    p_old_participant,
    p_new_participant,
    p_event_scores,
    '[]'::jsonb
  );

  delete from public.match_feedback row_data
  where row_data.id in (
    select (snapshot_row ->> 'id')::uuid
    from pg_catalog.jsonb_array_elements(v_match_feedback) snapshot_row
  );
  delete from public.locked_matches row_data
  where row_data.id in (
    select (snapshot_row ->> 'id')::uuid
    from pg_catalog.jsonb_array_elements(v_locked_matches) snapshot_row
  );
  delete from public.match_results row_data
  where row_data.id in (
    select (snapshot_row ->> 'id')::uuid
    from pg_catalog.jsonb_array_elements(v_match_results) snapshot_row
  );
  delete from public.event_attendance
  where match_id = p_static_match_id
    and event_id = p_event_id
    and participant_number in (p_old_participant, p_new_participant);

  insert into public.match_results
  select restored.*
  from pg_catalog.jsonb_populate_recordset(null::public.match_results, v_match_results) restored;

  insert into public.match_feedback
  select restored.*
  from pg_catalog.jsonb_populate_recordset(null::public.match_feedback, v_match_feedback) restored;

  insert into public.locked_matches
  select restored.*
  from pg_catalog.jsonb_populate_recordset(null::public.locked_matches, v_locked_matches) restored;

  insert into public.event_attendance
  select restored.*
  from pg_catalog.jsonb_populate_recordset(null::public.event_attendance, v_attendance) restored;

  delete from public.organizer_requests request_row
  where request_row.id in (
    select (snapshot_row ->> 'id')::uuid
    from pg_catalog.jsonb_array_elements(v_organizer_requests) snapshot_row
  );

  insert into public.organizer_requests
  select restored.*
  from pg_catalog.jsonb_populate_recordset(null::public.organizer_requests, v_organizer_requests) restored;

  delete from public.event3_test_match_results
  where match_id = p_event3_match_id and event_id = p_event_id;

  return coalesce(v_result, '{}'::jsonb) || pg_catalog.jsonb_build_object('test_mode', true);
end;
$$;

revoke all on function public.replace_event3_participant_live(uuid, uuid, integer, integer, integer, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.replace_event3_participant(uuid, uuid, integer, integer, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_event3_participant_live(uuid, uuid, integer, integer, integer, jsonb, jsonb)
  to service_role;
grant execute on function public.replace_event3_participant(uuid, uuid, integer, integer, integer, jsonb, jsonb)
  to service_role;
