begin;

-- Cache rows are reusable only when both the participant-content identity and
-- the scoring implementation match. The JSON fields retain the exact inputs to
-- the displayed total instead of reconstructing today's weights from old rows.
alter table public.compatibility_cache
  add column if not exists score_model_version text,
  add column if not exists score_breakdown jsonb,
  add column if not exists question_scores jsonb,
  add column if not exists vibe_axes jsonb,
  add column if not exists vibe_model_version text;

alter table public.compatibility_cache
  drop constraint if exists compatibility_cache_score_breakdown_object,
  add constraint compatibility_cache_score_breakdown_object
    check (score_breakdown is null or jsonb_typeof(score_breakdown) = 'object'),
  drop constraint if exists compatibility_cache_question_scores_object,
  add constraint compatibility_cache_question_scores_object
    check (question_scores is null or jsonb_typeof(question_scores) = 'object'),
  drop constraint if exists compatibility_cache_vibe_axes_object,
  add constraint compatibility_cache_vibe_axes_object
    check (vibe_axes is null or jsonb_typeof(vibe_axes) = 'object'),
  drop constraint if exists compatibility_cache_versioned_payload_complete,
  add constraint compatibility_cache_versioned_payload_complete
    check (
      score_model_version is null
      or (
        score_breakdown is not null
        and jsonb_typeof(score_breakdown) = 'object'
        and question_scores is not null
        and jsonb_typeof(question_scores) = 'object'
        and vibe_axes is not null
        and jsonb_typeof(vibe_axes) = 'object'
        and vibe_model_version is not null
      )
    );

create index if not exists idx_compatibility_cache_exact_model_identity
  on public.compatibility_cache (
    participant_a_number,
    participant_b_number,
    score_model_version,
    combined_content_hash
  );

comment on column public.compatibility_cache.score_model_version is
  'Exact deterministic compatibility scorer version. Null denotes a legacy row.';
comment on column public.compatibility_cache.score_breakdown is
  'Event-independent component scores produced by score_model_version.';
comment on column public.compatibility_cache.question_scores is
  'Per-question weighted point contributions produced by score_model_version.';
comment on column public.compatibility_cache.vibe_axes is
  'Validated AI-vibe axis scores used by this exact cache row.';

-- A timestamp alone cannot mark a cache fresh across a weights/model rollout.
alter table public.cache_metadata
  add column if not exists score_model_version text;

create index if not exists idx_cache_metadata_event_model_freshness
  on public.cache_metadata (event_id, score_model_version, last_precache_timestamp desc);

comment on column public.cache_metadata.score_model_version is
  'Scorer version for which the recorded cache session completed without errors.';

create or replace view public.v_cache_freshness
with (security_invoker = true)
as
with latest_metadata as (
  select distinct on (metadata.event_id) metadata.*
  from public.cache_metadata metadata
  order by metadata.event_id, metadata.last_precache_timestamp desc, metadata.id desc
), participant_scope as (
  select
    metadata.*,
    participant.assigned_number,
    (
      coalesce(participant.survey_data_updated_at, '-infinity'::timestamptz) > metadata.last_precache_timestamp
      or (
        participant.event_id = metadata.event_id
        and coalesce(participant.event_enrolled_at, participant.created_at, '-infinity'::timestamptz) > metadata.last_precache_timestamp
      )
      or (
        (participant.signup_for_next_event is true or participant.auto_signup_next_event is true)
        and coalesce(participant.next_event_signup_timestamp, '-infinity'::timestamptz) > metadata.last_precache_timestamp
      )
    ) as needs_recache
  from latest_metadata metadata
  left join public.participants participant
    on participant.assigned_number <> 9999
    and participant.attendance_denied_at is null
    and (
      participant.event_id = metadata.event_id
      or participant.signup_for_next_event is true
      or participant.auto_signup_next_event is true
    )
)
select
  scope.event_id,
  scope.last_precache_timestamp,
  scope.total_participants_cached,
  scope.total_pairs_cached,
  count(distinct scope.assigned_number) as total_participants_in_event,
  count(distinct scope.assigned_number) filter (where scope.needs_recache) as participants_needing_recache,
  case
    when scope.score_model_version is distinct from '2026-08-25-v7-balanced-100'
      then 'STALE_MODEL'
    when count(distinct scope.assigned_number) filter (where scope.needs_recache) > 0
      then 'STALE - ' || count(distinct scope.assigned_number) filter (where scope.needs_recache) || ' participants updated'
    else 'FRESH'
  end as cache_status,
  scope.created_at as last_cache_time,
  extract(epoch from now() - scope.last_precache_timestamp) / 3600::numeric as hours_since_cache,
  scope.score_model_version
from participant_scope scope
group by
  scope.id,
  scope.event_id,
  scope.last_precache_timestamp,
  scope.total_participants_cached,
  scope.total_pairs_cached,
  scope.created_at,
  scope.score_model_version;

revoke all on table public.v_cache_freshness from public, anon, authenticated;
grant select on table public.v_cache_freshness to service_role;

-- Standard-event matches retain the complete event-time scoring payload. This
-- deliberately leaves historical rows null instead of relabeling old weights.
alter table public.match_results
  add column if not exists score_model_version text,
  add column if not exists score_snapshot jsonb,
  add column if not exists score_content_hash text;

alter table public.match_results
  drop constraint if exists match_results_score_snapshot_object,
  add constraint match_results_score_snapshot_object
    check (score_snapshot is null or jsonb_typeof(score_snapshot) = 'object'),
  drop constraint if exists match_results_score_provenance_complete,
  add constraint match_results_score_provenance_complete
    check (
      case
        when score_model_version is null and score_snapshot is null and score_content_hash is null
          then true
        when score_model_version is not null and score_snapshot is not null and score_content_hash is not null
          then coalesce(score_snapshot ->> 'scoreModelVersion' = score_model_version
            and score_snapshot ->> 'combinedContentHash' = score_content_hash
            and jsonb_typeof(score_snapshot -> 'scoreBreakdown') = 'object'
            and jsonb_typeof(score_snapshot -> 'questionScores') = 'object'
            and jsonb_typeof(score_snapshot -> 'vibeAxes') = 'object'
            and score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
            and score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
            and score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
            and case
              when compatibility_score is not null
                and jsonb_typeof(score_snapshot -> 'totalScore') = 'number'
                then (score_snapshot ->> 'totalScore')::numeric = compatibility_score::numeric
              else false
            end, false)
        else false
      end
    );

create index if not exists idx_match_results_score_model_version
  on public.match_results (score_model_version)
  where score_model_version is not null;

comment on column public.match_results.score_snapshot is
  'Immutable event-time total, component, question, vibe-axis, and model provenance.';

-- Event3 stores a mirrored row for each attendee, so each phase needs its own
-- immutable snapshot. Swaps/replacements update both mirrored snapshots.
alter table public.event3_matches
  add column if not exists phase2_score_model_version text,
  add column if not exists phase2_score_snapshot jsonb,
  add column if not exists phase2_score_content_hash text,
  add column if not exists phase3_score_model_version text,
  add column if not exists phase3_score_snapshot jsonb,
  add column if not exists phase3_score_content_hash text;

alter table public.event3_matches
  drop constraint if exists event3_matches_phase2_score_snapshot_object,
  add constraint event3_matches_phase2_score_snapshot_object
    check (phase2_score_snapshot is null or jsonb_typeof(phase2_score_snapshot) = 'object'),
  drop constraint if exists event3_matches_phase3_score_snapshot_object,
  add constraint event3_matches_phase3_score_snapshot_object
    check (phase3_score_snapshot is null or jsonb_typeof(phase3_score_snapshot) = 'object'),
  drop constraint if exists event3_matches_phase2_score_provenance_complete,
  add constraint event3_matches_phase2_score_provenance_complete
    check (
      case
        when phase2_score_model_version is null and phase2_score_snapshot is null and phase2_score_content_hash is null
          then true
        when phase2_score_model_version is not null and phase2_score_snapshot is not null and phase2_score_content_hash is not null
          then coalesce(phase2_score_snapshot ->> 'scoreModelVersion' = phase2_score_model_version
            and phase2_score_snapshot ->> 'combinedContentHash' = phase2_score_content_hash
            and jsonb_typeof(phase2_score_snapshot -> 'scoreBreakdown') = 'object'
            and jsonb_typeof(phase2_score_snapshot -> 'questionScores') = 'object'
            and jsonb_typeof(phase2_score_snapshot -> 'vibeAxes') = 'object'
            and phase2_score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
            and phase2_score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
            and phase2_score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
            and case
              when phase2_score is not null
                and jsonb_typeof(phase2_score_snapshot -> 'totalScore') = 'number'
                then (phase2_score_snapshot ->> 'totalScore')::numeric = phase2_score::numeric
              else false
            end, false)
        else false
      end
    ),
  drop constraint if exists event3_matches_phase3_score_provenance_complete,
  add constraint event3_matches_phase3_score_provenance_complete
    check (
      case
        when phase3_score_model_version is null and phase3_score_snapshot is null and phase3_score_content_hash is null
          then true
        when phase3_score_model_version is not null and phase3_score_snapshot is not null and phase3_score_content_hash is not null
          then coalesce(phase3_score_snapshot ->> 'scoreModelVersion' = phase3_score_model_version
            and phase3_score_snapshot ->> 'combinedContentHash' = phase3_score_content_hash
            and jsonb_typeof(phase3_score_snapshot -> 'scoreBreakdown') = 'object'
            and jsonb_typeof(phase3_score_snapshot -> 'questionScores') = 'object'
            and jsonb_typeof(phase3_score_snapshot -> 'vibeAxes') = 'object'
            and phase3_score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
            and phase3_score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
            and phase3_score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
            and case
              when phase3_score is not null
                and jsonb_typeof(phase3_score_snapshot -> 'totalScore') = 'number'
                then (phase3_score_snapshot ->> 'totalScore')::numeric = phase3_score::numeric
              else false
            end, false)
        else false
      end
    );

comment on column public.event3_matches.phase2_score_snapshot is
  'Immutable Phase 2 event-time compatibility payload; null means legacy/unknown model.';
comment on column public.event3_matches.phase3_score_snapshot is
  'Immutable Phase 3 event-time compatibility payload; null means legacy/unknown model.';

alter table public.event3_test_match_results
  add column if not exists score_model_version text,
  add column if not exists score_snapshot jsonb,
  add column if not exists score_content_hash text;

alter table public.event3_test_match_results
  drop constraint if exists event3_test_match_results_score_snapshot_object,
  add constraint event3_test_match_results_score_snapshot_object
    check (score_snapshot is null or jsonb_typeof(score_snapshot) = 'object'),
  drop constraint if exists event3_test_match_results_score_provenance_complete,
  add constraint event3_test_match_results_score_provenance_complete
    check (
      case
        when score_model_version is null and score_snapshot is null and score_content_hash is null
          then true
        when score_model_version is not null and score_snapshot is not null and score_content_hash is not null
          then coalesce(score_snapshot ->> 'scoreModelVersion' = score_model_version
            and score_snapshot ->> 'combinedContentHash' = score_content_hash
            and jsonb_typeof(score_snapshot -> 'scoreBreakdown') = 'object'
            and jsonb_typeof(score_snapshot -> 'questionScores') = 'object'
            and jsonb_typeof(score_snapshot -> 'vibeAxes') = 'object'
            and score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
            and score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
            and score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
            and case
              when compatibility_score is not null
                and jsonb_typeof(score_snapshot -> 'totalScore') = 'number'
                then (score_snapshot ->> 'totalScore')::numeric = compatibility_score::numeric
              else false
            end, false)
        else false
      end
    );

-- Replace the seven-argument function with one backwards-compatible optional
-- argument. Existing callers can omit it; current callers always send it.
drop function if exists public.record_cache_session(
  integer,
  integer,
  integer,
  integer,
  integer,
  numeric,
  text
);

drop function if exists public.record_cache_session(
  integer,
  integer,
  integer,
  integer,
  integer,
  numeric,
  text,
  text
);

create function public.record_cache_session(
  p_event_id integer,
  p_participants_cached integer,
  p_pairs_cached integer,
  p_duration_ms integer,
  p_ai_calls integer,
  p_cache_hit_rate numeric,
  p_notes text,
  p_score_model_version text default null
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.cache_metadata (
    event_id,
    total_participants_cached,
    total_pairs_cached,
    cache_session_duration_ms,
    ai_calls_made,
    cache_hit_rate,
    notes,
    score_model_version
  ) values (
    p_event_id,
    p_participants_cached,
    p_pairs_cached,
    p_duration_ms,
    p_ai_calls,
    p_cache_hit_rate,
    p_notes,
    p_score_model_version
  );
end;
$$;

revoke execute on function public.record_cache_session(
  integer, integer, integer, integer, integer, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.record_cache_session(
  integer, integer, integer, integer, integer, numeric, text, text
) to service_role;

-- Test-mode results follow the same provenance contract as production matches.
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
  v_item jsonb;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Test match rows must be a JSON array';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );

  if not exists (
    select 1
    from public.event_state state
    where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and state.current_event_id = p_event_id
      and state.test_mode_active is true
  ) then
    raise exception 'Event3 test mode is not active for event %', p_event_id;
  end if;

  -- Simulated test rows may remain explicitly unversioned. Any row claiming a
  -- current score must carry the complete immutable snapshot contract.
  for v_item in
    select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    if nullif(v_item ->> 'score_model_version', '') is null
      and coalesce(v_item -> 'score_snapshot', 'null'::jsonb) = 'null'::jsonb
      and nullif(v_item ->> 'score_content_hash', '') is null then
      continue;
    end if;
    if nullif(v_item ->> 'score_model_version', '') is distinct from '2026-08-25-v7-balanced-100'
      or jsonb_typeof(v_item -> 'score_snapshot') is distinct from 'object'
      or nullif(v_item ->> 'score_content_hash', '') is null
      or v_item -> 'score_snapshot' ->> 'scoreModelVersion' is distinct from v_item ->> 'score_model_version'
      or v_item -> 'score_snapshot' ->> 'combinedContentHash' is distinct from v_item ->> 'score_content_hash'
      or jsonb_typeof(v_item -> 'score_snapshot' -> 'scoreBreakdown') is distinct from 'object'
      or jsonb_typeof(v_item -> 'score_snapshot' -> 'questionScores') is distinct from 'object'
      or jsonb_typeof(v_item -> 'score_snapshot' -> 'vibeAxes') is distinct from 'object'
      or v_item -> 'score_snapshot' ->> 'vibeModel' is distinct from 'gpt-5.4-mini'
      or v_item -> 'score_snapshot' ->> 'vibeModelVersion' is distinct from 'balanced-vibe12-v1'
      or v_item -> 'score_snapshot' ->> 'vibeModelTag' is distinct from 'gpt-5.4-mini|balanced-vibe12-v1'
      or jsonb_typeof(v_item -> 'score_snapshot' -> 'totalScore') is distinct from 'number'
      or jsonb_typeof(v_item -> 'compatibility_score') is distinct from 'number'
      or (v_item -> 'score_snapshot' ->> 'totalScore')::numeric
        is distinct from (v_item ->> 'compatibility_score')::numeric then
      raise exception 'Versioned test match rows require complete current-model score provenance';
    end if;
  end loop;

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
    humor_early_openness_bonus,
    score_model_version,
    score_snapshot,
    score_content_hash
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
    coalesce(row_data.humor_early_openness_bonus, 'none'),
    row_data.score_model_version,
    row_data.score_snapshot,
    row_data.score_content_hash
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
    humor_early_openness_bonus text,
    score_model_version text,
    score_snapshot jsonb,
    score_content_hash text
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.replace_event3_test_match_results(integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_event3_test_match_results(integer, jsonb)
  to service_role;

-- The original swap RPC owns the mature topology/audit transaction. This
-- service-role-only wrapper requires complete current-model provenance before
-- invoking it, then enriches the inserted rows and audit in that same database
-- transaction. Calling the new name also makes an unapplied migration fail
-- before the legacy RPC can write unsnapshotted results.
create or replace function public.apply_match_swap_plan_with_score_provenance(
  p_match_id uuid,
  p_event_id integer,
  p_round smallint,
  p_pairs jsonb,
  p_affected integer[],
  p_expected_pairs jsonb default '[]'::jsonb,
  p_plan_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_item jsonb;
  v_a integer;
  v_b integer;
  v_total numeric;
  v_version text;
  v_snapshot jsonb;
  v_hash text;
  v_updated integer;
  v_audit_id uuid;
begin
  if pg_catalog.jsonb_typeof(p_pairs) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_pairs) = 0 then
    raise exception 'pairs must be a non-empty JSON array';
  end if;
  if coalesce(pg_catalog.array_length(p_affected, 1), 0) = 0
    or exists (
      select 1 from pg_catalog.unnest(p_affected) affected(participant_number)
      where affected.participant_number is null or affected.participant_number <= 0
    )
    or (
      select pg_catalog.count(distinct affected.participant_number)
      from pg_catalog.unnest(p_affected) affected(participant_number)
    ) <> pg_catalog.array_length(p_affected, 1) then
    raise exception 'affected participants must be a non-empty array of unique positive numbers';
  end if;

  -- Validate every pair before the base function deletes or inserts anything.
  for v_item in
    select value from pg_catalog.jsonb_array_elements(p_pairs)
  loop
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;
    v_total := (v_item ->> 'compatibility_score')::numeric;
    v_version := nullif(v_item ->> 'score_model_version', '');
    v_snapshot := v_item -> 'score_snapshot';
    v_hash := nullif(v_item ->> 'score_content_hash', '');
    if v_a is null or v_b is null or v_a <= 0 or v_b <= 0 or v_a = v_b
      or not (v_a = any(p_affected)) or not (v_b = any(p_affected))
      or v_total is null
      or v_version is distinct from '2026-08-25-v7-balanced-100'
      or pg_catalog.jsonb_typeof(v_snapshot) is distinct from 'object'
      or v_hash is null
      or v_snapshot ->> 'scoreModelVersion' is distinct from v_version
      or v_snapshot ->> 'combinedContentHash' is distinct from v_hash
      or pg_catalog.jsonb_typeof(v_snapshot -> 'scoreBreakdown') is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_snapshot -> 'questionScores') is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_snapshot -> 'vibeAxes') is distinct from 'object'
      or v_snapshot ->> 'vibeModel' is distinct from 'gpt-5.4-mini'
      or v_snapshot ->> 'vibeModelVersion' is distinct from 'balanced-vibe12-v1'
      or v_snapshot ->> 'vibeModelTag' is distinct from 'gpt-5.4-mini|balanced-vibe12-v1'
      or pg_catalog.jsonb_typeof(v_snapshot -> 'totalScore') is distinct from 'number'
      or (v_snapshot ->> 'totalScore')::numeric is distinct from v_total then
      raise exception 'Every swap pair must use affected participants and complete current-model score provenance';
    end if;
  end loop;

  v_result := public.apply_match_swap_plan(
    p_match_id,
    p_event_id,
    p_round,
    p_pairs,
    p_affected,
    p_expected_pairs,
    p_plan_summary
  );

  for v_item in
    select value from pg_catalog.jsonb_array_elements(p_pairs)
  loop
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;
    update public.match_results
    set score_model_version = v_item ->> 'score_model_version',
        score_snapshot = v_item -> 'score_snapshot',
        score_content_hash = v_item ->> 'score_content_hash'
    where match_id = p_match_id
      and event_id = p_event_id
      and round = p_round
      and participant_a_number = v_a
      and participant_b_number = v_b;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'The swap transaction did not create exactly one row for pair %-%', v_a, v_b;
    end if;
  end loop;

  v_audit_id := nullif(v_result ->> 'audit_id', '')::uuid;
  if v_audit_id is null then
    raise exception 'The base swap transaction did not return an audit id';
  end if;
  update public.match_swap_audits audit
  set after_rows = coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(result_row) order by result_row.id::text)
    from public.match_results result_row
    where result_row.match_id = p_match_id
      and result_row.event_id = p_event_id
      and result_row.round = p_round
      and (
        result_row.participant_a_number = any(p_affected)
        or result_row.participant_b_number = any(p_affected)
      )
  ), '[]'::jsonb)
  where audit.id = v_audit_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'The swap audit could not be enriched with score provenance';
  end if;

  return v_result || pg_catalog.jsonb_build_object('score_provenance_persisted', true);
end;
$$;

revoke all on function public.apply_match_swap_plan_with_score_provenance(
  uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_match_swap_plan_with_score_provenance(
  uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
) to service_role;

-- Prevent direct service-role calls from bypassing immutable provenance. The
-- SECURITY DEFINER wrapper above remains the only callable write surface.
revoke all on function public.apply_match_swap_plan(
  uuid, integer, smallint, jsonb, integer[], jsonb, jsonb
) from public, anon, authenticated, service_role;

-- Keep the mature participant-replacement transaction intact, but wrap it so
-- the new score provenance commits atomically with every identity/table change.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.replace_event3_participant_without_score_provenance(uuid,uuid,integer,integer,integer,jsonb,jsonb)'
  ) is null then
    if pg_catalog.to_regprocedure(
      'public.replace_event3_participant(uuid,uuid,integer,integer,integer,jsonb,jsonb)'
    ) is null then
      raise exception 'The existing Event3 participant replacement RPC is required';
    end if;
    alter function public.replace_event3_participant(
      uuid, uuid, integer, integer, integer, jsonb, jsonb
    ) rename to replace_event3_participant_without_score_provenance;
  end if;
end;
$migration$;

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
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_item jsonb;
  v_phase text;
  v_a integer;
  v_b integer;
  v_result_id uuid;
  v_updated integer;
  v_test_mode boolean := false;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;

  -- Preserve the lifecycle lock order used by begin/end test mode and the
  -- mature test-aware replacement wrapper before any state read or DML.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );

  if pg_catalog.jsonb_typeof(coalesce(p_event_scores, '[]'::jsonb)) is distinct from 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_match_result_scores, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Score payloads must be JSON arrays';
  end if;

  -- Validate every supplied provenance object before the mature transaction
  -- changes identities. Any later topology/count mismatch also raises and rolls
  -- the base call back because both functions share the same transaction.
  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_event_scores, '[]'::jsonb))
  loop
    v_phase := v_item ->> 'phase';
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;
    if v_phase is null or v_phase not in ('phase2', 'phase3')
      or v_a is null or v_b is null or v_a <= 0 or v_b <= 0 or v_a = v_b
      or (v_item ->> 'score') is null
      or nullif(v_item ->> 'score_model_version', '') is distinct from '2026-08-25-v7-balanced-100'
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
      or (v_item -> 'score_snapshot' ->> 'totalScore')::numeric is distinct from (v_item ->> 'score')::numeric then
      raise exception 'Every Event3 replacement pair requires internally consistent current-model score provenance';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(p_event_scores, '[]'::jsonb)) item
    group by item ->> 'phase',
      least((item ->> 'a')::integer, (item ->> 'b')::integer),
      greatest((item ->> 'a')::integer, (item ->> 'b')::integer)
    having count(*) > 1
  ) then
    raise exception 'Event3 replacement score pairs must be unique per phase';
  end if;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_match_result_scores, '[]'::jsonb))
  loop
    v_result_id := (v_item ->> 'id')::uuid;
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;
    if v_result_id is null
      or v_a is null or v_b is null or v_a <= 0 or v_b <= 0 or v_a = v_b
      or (v_item ->> 'compatibility_score') is null
      or nullif(v_item ->> 'score_model_version', '') is distinct from '2026-08-25-v7-balanced-100'
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
      or (v_item -> 'score_snapshot' ->> 'totalScore')::numeric is distinct from (v_item ->> 'compatibility_score')::numeric then
      raise exception 'Every standard replacement pair requires internally consistent current-model score provenance';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(p_match_result_scores, '[]'::jsonb)) item
    group by item ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'Standard replacement score rows must be unique';
  end if;

  select coalesce(state.test_mode_active, false)
  into v_test_mode
  from public.event_state state
  where state.match_id = p_event3_match_id
    and state.current_event_id = p_event_id;

  -- The mature base RPC predates immutable snapshots and updates numeric scores
  -- before this wrapper can write their replacements. Clear only the affected
  -- provenance inside this same transaction so the all-or-none CHECK remains
  -- true throughout; coverage checks below guarantee every resulting pair is
  -- restored before commit.
  update public.event3_matches
  set phase2_score_model_version = null,
      phase2_score_snapshot = null,
      phase2_score_content_hash = null
  where match_id = p_event3_match_id and event_id = p_event_id
    and (
      participant_number in (p_old_participant, p_new_participant)
      or phase2_partner in (p_old_participant, p_new_participant)
    );

  update public.event3_matches
  set phase3_score_model_version = null,
      phase3_score_snapshot = null,
      phase3_score_content_hash = null
  where match_id = p_event3_match_id and event_id = p_event_id
    and (
      participant_number in (p_old_participant, p_new_participant)
      or phase3_partner in (p_old_participant, p_new_participant)
    );

  if not coalesce(v_test_mode, false) then
    update public.match_results
    set score_model_version = null,
        score_snapshot = null,
        score_content_hash = null
    where match_id = p_static_match_id and event_id = p_event_id
      and participant_c_number is null
      and (
        participant_a_number in (p_old_participant, p_new_participant)
        or participant_b_number in (p_old_participant, p_new_participant)
      );
  end if;

  -- A function call does not create a separate transaction: any provenance
  -- error below rolls back the complete replacement performed by the base RPC.
  v_result := public.replace_event3_participant_without_score_provenance(
    p_event3_match_id,
    p_static_match_id,
    p_event_id,
    p_old_participant,
    p_new_participant,
    p_event_scores,
    p_match_result_scores
  );

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_event_scores, '[]'::jsonb))
  loop
    v_phase := v_item ->> 'phase';
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;

    if v_phase = 'phase2' then
      update public.event3_matches
      set phase2_score_model_version = nullif(v_item ->> 'score_model_version', ''),
          phase2_score_snapshot = case
            when pg_catalog.jsonb_typeof(v_item -> 'score_snapshot') = 'object' then v_item -> 'score_snapshot'
            else null
          end,
          phase2_score_content_hash = nullif(v_item ->> 'score_content_hash', '')
      where match_id = p_event3_match_id and event_id = p_event_id
        and (
          (participant_number = v_a and phase2_partner = v_b)
          or (participant_number = v_b and phase2_partner = v_a)
        );
    elsif v_phase = 'phase3' then
      update public.event3_matches
      set phase3_score_model_version = nullif(v_item ->> 'score_model_version', ''),
          phase3_score_snapshot = case
            when pg_catalog.jsonb_typeof(v_item -> 'score_snapshot') = 'object' then v_item -> 'score_snapshot'
            else null
          end,
          phase3_score_content_hash = nullif(v_item ->> 'score_content_hash', '')
      where match_id = p_event3_match_id and event_id = p_event_id
        and (
          (participant_number = v_a and phase3_partner = v_b)
          or (participant_number = v_b and phase3_partner = v_a)
        );
    else
      raise exception 'Invalid event score phase';
    end if;
    get diagnostics v_updated = row_count;
    if v_updated <> 2 then
      raise exception 'Event3 replacement provenance expected two mirrored rows for phase % pair %-%; updated %',
        v_phase, v_a, v_b, v_updated;
    end if;
  end loop;

  if exists (
    with expected_pairs as (
      select 'phase2'::text as phase,
        least(participant_number, phase2_partner) as a,
        greatest(participant_number, phase2_partner) as b
      from public.event3_matches
      where match_id = p_event3_match_id and event_id = p_event_id
        and phase2_partner is not null
        and (
          participant_number in (p_old_participant, p_new_participant)
          or phase2_partner in (p_old_participant, p_new_participant)
        )
      union
      select 'phase3'::text,
        least(participant_number, phase3_partner),
        greatest(participant_number, phase3_partner)
      from public.event3_matches
      where match_id = p_event3_match_id and event_id = p_event_id
        and phase3_partner is not null
        and (
          participant_number in (p_old_participant, p_new_participant)
          or phase3_partner in (p_old_participant, p_new_participant)
        )
    ), provided_pairs as (
      select item ->> 'phase' as phase,
        least((item ->> 'a')::integer, (item ->> 'b')::integer) as a,
        greatest((item ->> 'a')::integer, (item ->> 'b')::integer) as b
      from pg_catalog.jsonb_array_elements(coalesce(p_event_scores, '[]'::jsonb)) item
    )
    select 1
    from expected_pairs expected
    where not exists (
      select 1 from provided_pairs provided
      where provided.phase = expected.phase and provided.a = expected.a and provided.b = expected.b
    )
  ) then
    raise exception 'Event3 replacement score payload omitted an affected pair';
  end if;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(coalesce(p_match_result_scores, '[]'::jsonb))
  loop
    v_result_id := (v_item ->> 'id')::uuid;
    v_a := (v_item ->> 'a')::integer;
    v_b := (v_item ->> 'b')::integer;

    update public.match_results
    set score_model_version = nullif(v_item ->> 'score_model_version', ''),
        score_snapshot = case
          when pg_catalog.jsonb_typeof(v_item -> 'score_snapshot') = 'object' then v_item -> 'score_snapshot'
          else null
        end,
        score_content_hash = nullif(v_item ->> 'score_content_hash', ''),
        disagreement_style_score = coalesce((v_item ->> 'disagreement_style_score')::numeric, disagreement_style_score),
        current_life_overlap_score = coalesce((v_item ->> 'current_life_overlap_score')::numeric, current_life_overlap_score),
        similarity_preference_score = coalesce((v_item ->> 'similarity_preference_score')::numeric, similarity_preference_score),
        attachment_pace_score = coalesce((v_item ->> 'attachment_pace_score')::numeric, attachment_pace_score)
    where id = v_result_id
      and match_id = p_static_match_id
      and event_id = p_event_id
      and participant_a_number = v_a
      and participant_b_number = v_b;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'Standard replacement provenance expected one row for result %; updated %', v_result_id, v_updated;
    end if;
  end loop;

  if not coalesce(v_test_mode, false) and exists (
    select 1
    from public.match_results result_row
    where result_row.match_id = p_static_match_id
      and result_row.event_id = p_event_id
      and result_row.participant_a_number is not null
      and result_row.participant_b_number is not null
      and result_row.participant_a_number <> 9999
      and result_row.participant_b_number <> 9999
      and result_row.participant_c_number is null
      and (
        result_row.participant_a_number in (p_old_participant, p_new_participant)
        or result_row.participant_b_number in (p_old_participant, p_new_participant)
      )
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(coalesce(p_match_result_scores, '[]'::jsonb)) item
        where (item ->> 'id')::uuid = result_row.id
      )
  ) then
    raise exception 'Standard replacement score payload omitted an affected individual result';
  end if;

  return v_result;
end;
$$;

revoke all on function public.replace_event3_participant(
  uuid, uuid, integer, integer, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_event3_participant(
  uuid, uuid, integer, integer, integer, jsonb, jsonb
) to service_role;

-- The public wrapper is SECURITY DEFINER so these mature implementation
-- helpers can be private. Direct service-role access would bypass provenance.
revoke all on function public.replace_event3_participant_without_score_provenance(
  uuid, uuid, integer, integer, integer, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.replace_event3_participant_live(
  uuid, uuid, integer, integer, integer, jsonb, jsonb
) from public, anon, authenticated, service_role;

-- Re-pairing a missing attendee touches mirrored match rows, immutable score
-- provenance, and physical seats. Keep those mutations in one transaction and
-- reject a stale organizer screen rather than applying a partial swap.
create or replace function public.swap_event3_match_partner(
  p_match_id uuid,
  p_event_id integer,
  p_phase text,
  p_missing_participant integer,
  p_replacement_participant integer,
  p_expected_missing_partner integer,
  p_expected_replacement_partner integer,
  p_first_score jsonb,
  p_second_score jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_missing_partner integer;
  v_replacement_partner integer;
  v_mirror_partner integer;
  v_replacement_row_exists boolean := false;
  v_assignment_round integer;
  v_first_total numeric;
  v_first_version text;
  v_first_snapshot jsonb;
  v_first_hash text;
  v_second_total numeric;
  v_second_version text;
  v_second_snapshot jsonb;
  v_second_hash text;
  v_missing_table integer;
  v_replacement_table integer;
  v_missing_assignment_count integer := 0;
  v_replacement_assignment_count integer := 0;
begin
  if p_match_id is null or p_event_id is null or p_event_id <= 0 then
    raise exception 'A match id and positive event id are required';
  end if;
  if p_phase is null or p_phase not in ('phase2', 'phase3') then
    raise exception 'Phase must be phase2 or phase3';
  end if;
  if p_missing_participant is null or p_missing_participant <= 0
    or p_replacement_participant is null or p_replacement_participant <= 0
    or p_missing_participant = p_replacement_participant then
    raise exception 'Two different positive participant numbers are required';
  end if;
  if p_expected_missing_partner is null
    or p_expected_missing_partner in (p_missing_participant, p_replacement_participant) then
    raise exception 'The expected missing-participant partner is invalid';
  end if;
  if p_expected_replacement_partner is not null
    and p_expected_replacement_partner in (
      p_missing_participant,
      p_replacement_participant,
      p_expected_missing_partner
    ) then
    raise exception 'The expected replacement-participant partner is invalid';
  end if;

  -- Serialize organizer swaps with begin/end test mode before reading any
  -- membership or topology. This prevents a concurrently captured test-mode
  -- snapshot from later restoring over a committed organizer change.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );

  if not exists (
    select 1 from public.event3_participants
    where match_id = p_match_id and event_id = p_event_id
      and participant_number = p_missing_participant
  ) or not exists (
    select 1 from public.event3_participants
    where match_id = p_match_id and event_id = p_event_id
      and participant_number = p_replacement_participant
  ) then
    raise exception 'Both participants must belong to this Event3 event';
  end if;

  if jsonb_typeof(p_first_score) is distinct from 'object' then
    raise exception 'The replacement pair requires a complete score object';
  end if;
  v_first_total := (p_first_score ->> 'score')::numeric;
  v_first_version := nullif(p_first_score ->> 'score_model_version', '');
  v_first_snapshot := p_first_score -> 'score_snapshot';
  v_first_hash := nullif(p_first_score ->> 'score_content_hash', '');
  if v_first_total is null
    or v_first_version is distinct from '2026-08-25-v7-balanced-100'
    or jsonb_typeof(v_first_snapshot) is distinct from 'object'
    or v_first_hash is null
    or v_first_snapshot ->> 'scoreModelVersion' is distinct from v_first_version
    or v_first_snapshot ->> 'combinedContentHash' is distinct from v_first_hash
    or jsonb_typeof(v_first_snapshot -> 'scoreBreakdown') is distinct from 'object'
    or jsonb_typeof(v_first_snapshot -> 'questionScores') is distinct from 'object'
    or jsonb_typeof(v_first_snapshot -> 'vibeAxes') is distinct from 'object'
    or v_first_snapshot ->> 'vibeModel' is distinct from 'gpt-5.4-mini'
    or v_first_snapshot ->> 'vibeModelVersion' is distinct from 'balanced-vibe12-v1'
    or v_first_snapshot ->> 'vibeModelTag' is distinct from 'gpt-5.4-mini|balanced-vibe12-v1'
    or jsonb_typeof(v_first_snapshot -> 'totalScore') is distinct from 'number'
    or (v_first_snapshot ->> 'totalScore')::numeric is distinct from v_first_total then
    raise exception 'The replacement pair score provenance is incomplete or inconsistent';
  end if;

  if p_expected_replacement_partner is null then
    if p_second_score is not null and p_second_score <> 'null'::jsonb then
      raise exception 'An unmatched participant cannot receive a second pair score';
    end if;
  else
    if jsonb_typeof(p_second_score) is distinct from 'object' then
      raise exception 'The second pair requires a complete score object';
    end if;
    v_second_total := (p_second_score ->> 'score')::numeric;
    v_second_version := nullif(p_second_score ->> 'score_model_version', '');
    v_second_snapshot := p_second_score -> 'score_snapshot';
    v_second_hash := nullif(p_second_score ->> 'score_content_hash', '');
    if v_second_total is null
      or v_second_version is distinct from '2026-08-25-v7-balanced-100'
      or jsonb_typeof(v_second_snapshot) is distinct from 'object'
      or v_second_hash is null
      or v_second_snapshot ->> 'scoreModelVersion' is distinct from v_second_version
      or v_second_snapshot ->> 'combinedContentHash' is distinct from v_second_hash
      or jsonb_typeof(v_second_snapshot -> 'scoreBreakdown') is distinct from 'object'
      or jsonb_typeof(v_second_snapshot -> 'questionScores') is distinct from 'object'
      or jsonb_typeof(v_second_snapshot -> 'vibeAxes') is distinct from 'object'
      or v_second_snapshot ->> 'vibeModel' is distinct from 'gpt-5.4-mini'
      or v_second_snapshot ->> 'vibeModelVersion' is distinct from 'balanced-vibe12-v1'
      or v_second_snapshot ->> 'vibeModelTag' is distinct from 'gpt-5.4-mini|balanced-vibe12-v1'
      or jsonb_typeof(v_second_snapshot -> 'totalScore') is distinct from 'number'
      or (v_second_snapshot ->> 'totalScore')::numeric is distinct from v_second_total then
      raise exception 'The second pair score provenance is incomplete or inconsistent';
    end if;
  end if;

  -- Lock all potentially affected match rows before checking the topology.
  perform 1
  from public.event3_matches
  where match_id = p_match_id and event_id = p_event_id
    and participant_number = any(array_remove(array[
      p_missing_participant,
      p_replacement_participant,
      p_expected_missing_partner,
      p_expected_replacement_partner
    ], null))
  for update;

  select case when p_phase = 'phase2' then phase2_partner else phase3_partner end
  into v_missing_partner
  from public.event3_matches
  where match_id = p_match_id and event_id = p_event_id
    and participant_number = p_missing_participant;
  if not found or v_missing_partner is distinct from p_expected_missing_partner then
    raise exception 'The missing participant match changed; refresh and retry';
  end if;

  select case when p_phase = 'phase2' then phase2_partner else phase3_partner end
  into v_replacement_partner
  from public.event3_matches
  where match_id = p_match_id and event_id = p_event_id
    and participant_number = p_replacement_participant;
  v_replacement_row_exists := found;
  if (v_replacement_row_exists and v_replacement_partner is distinct from p_expected_replacement_partner)
    or (not v_replacement_row_exists and p_expected_replacement_partner is not null) then
    raise exception 'The replacement participant match changed; refresh and retry';
  end if;

  select case when p_phase = 'phase2' then phase2_partner else phase3_partner end
  into v_mirror_partner
  from public.event3_matches
  where match_id = p_match_id and event_id = p_event_id
    and participant_number = p_expected_missing_partner;
  if not found or v_mirror_partner is distinct from p_missing_participant then
    raise exception 'The missing participant pair is not mirrored consistently';
  end if;

  if p_expected_replacement_partner is not null then
    select case when p_phase = 'phase2' then phase2_partner else phase3_partner end
    into v_mirror_partner
    from public.event3_matches
    where match_id = p_match_id and event_id = p_event_id
      and participant_number = p_expected_replacement_partner;
    if not found or v_mirror_partner is distinct from p_replacement_participant then
      raise exception 'The replacement participant pair is not mirrored consistently';
    end if;
  end if;

  if p_phase = 'phase2' then
    update public.event3_matches
    set phase2_partner = p_expected_replacement_partner,
        phase2_score = v_second_total,
        phase2_score_model_version = v_second_version,
        phase2_score_snapshot = v_second_snapshot,
        phase2_score_content_hash = v_second_hash
    where match_id = p_match_id and event_id = p_event_id
      and participant_number = p_missing_participant;

    update public.event3_matches
    set phase2_partner = p_replacement_participant,
        phase2_score = v_first_total,
        phase2_score_model_version = v_first_version,
        phase2_score_snapshot = v_first_snapshot,
        phase2_score_content_hash = v_first_hash
    where match_id = p_match_id and event_id = p_event_id
      and participant_number = p_expected_missing_partner;

    if v_replacement_row_exists then
      update public.event3_matches
      set phase2_partner = p_expected_missing_partner,
          phase2_score = v_first_total,
          phase2_score_model_version = v_first_version,
          phase2_score_snapshot = v_first_snapshot,
          phase2_score_content_hash = v_first_hash
      where match_id = p_match_id and event_id = p_event_id
        and participant_number = p_replacement_participant;
    else
      insert into public.event3_matches (
        match_id, event_id, participant_number,
        phase2_partner, phase2_score, phase2_score_model_version,
        phase2_score_snapshot, phase2_score_content_hash
      ) values (
        p_match_id, p_event_id, p_replacement_participant,
        p_expected_missing_partner, v_first_total, v_first_version,
        v_first_snapshot, v_first_hash
      );
    end if;

    if p_expected_replacement_partner is not null then
      update public.event3_matches
      set phase2_partner = p_missing_participant,
          phase2_score = v_second_total,
          phase2_score_model_version = v_second_version,
          phase2_score_snapshot = v_second_snapshot,
          phase2_score_content_hash = v_second_hash
      where match_id = p_match_id and event_id = p_event_id
        and participant_number = p_expected_replacement_partner;
    end if;
    v_assignment_round := 20;
  else
    update public.event3_matches
    set phase3_partner = p_expected_replacement_partner,
        phase3_score = v_second_total,
        phase3_score_model_version = v_second_version,
        phase3_score_snapshot = v_second_snapshot,
        phase3_score_content_hash = v_second_hash
    where match_id = p_match_id and event_id = p_event_id
      and participant_number = p_missing_participant;

    update public.event3_matches
    set phase3_partner = p_replacement_participant,
        phase3_score = v_first_total,
        phase3_score_model_version = v_first_version,
        phase3_score_snapshot = v_first_snapshot,
        phase3_score_content_hash = v_first_hash
    where match_id = p_match_id and event_id = p_event_id
      and participant_number = p_expected_missing_partner;

    if v_replacement_row_exists then
      update public.event3_matches
      set phase3_partner = p_expected_missing_partner,
          phase3_score = v_first_total,
          phase3_score_model_version = v_first_version,
          phase3_score_snapshot = v_first_snapshot,
          phase3_score_content_hash = v_first_hash
      where match_id = p_match_id and event_id = p_event_id
        and participant_number = p_replacement_participant;
    else
      insert into public.event3_matches (
        match_id, event_id, participant_number,
        phase3_partner, phase3_score, phase3_score_model_version,
        phase3_score_snapshot, phase3_score_content_hash
      ) values (
        p_match_id, p_event_id, p_replacement_participant,
        p_expected_missing_partner, v_first_total, v_first_version,
        v_first_snapshot, v_first_hash
      );
    end if;

    if p_expected_replacement_partner is not null then
      update public.event3_matches
      set phase3_partner = p_missing_participant,
          phase3_score = v_second_total,
          phase3_score_model_version = v_second_version,
          phase3_score_snapshot = v_second_snapshot,
          phase3_score_content_hash = v_second_hash
      where match_id = p_match_id and event_id = p_event_id
        and participant_number = p_expected_replacement_partner;
    end if;
    v_assignment_round := 30;
  end if;

  -- The mirrored rows are guaranteed above; now atomically exchange the two
  -- attendees' one-to-one table positions using the same legacy semantics.
  perform 1
  from public.session_assignments
  where match_id = p_match_id and event_id = p_event_id
    and round = v_assignment_round
    and participant_id in (p_missing_participant, p_replacement_participant)
  for update;

  select count(*), min(table_number)
  into v_missing_assignment_count, v_missing_table
  from public.session_assignments
  where match_id = p_match_id and event_id = p_event_id
    and round = v_assignment_round
    and participant_id = p_missing_participant;

  select count(*), min(table_number)
  into v_replacement_assignment_count, v_replacement_table
  from public.session_assignments
  where match_id = p_match_id and event_id = p_event_id
    and round = v_assignment_round
    and participant_id = p_replacement_participant;

  if v_missing_assignment_count > 1 or v_replacement_assignment_count > 1 then
    raise exception 'Duplicate one-to-one table assignments must be repaired before swapping';
  end if;

  if v_missing_assignment_count = 1 and v_replacement_assignment_count = 1 then
    update public.session_assignments
    set table_number = case
      when participant_id = p_missing_participant then v_replacement_table
      else v_missing_table
    end
    where match_id = p_match_id and event_id = p_event_id
      and round = v_assignment_round
      and participant_id in (p_missing_participant, p_replacement_participant);
  elsif v_missing_assignment_count = 1 then
    delete from public.session_assignments
    where match_id = p_match_id and event_id = p_event_id
      and round = v_assignment_round
      and participant_id = p_missing_participant;
    insert into public.session_assignments (
      match_id, event_id, round, table_number, participant_id
    ) values (
      p_match_id, p_event_id, v_assignment_round, v_missing_table, p_replacement_participant
    );
  elsif v_replacement_assignment_count = 1 then
    delete from public.session_assignments
    where match_id = p_match_id and event_id = p_event_id
      and round = v_assignment_round
      and participant_id = p_replacement_participant;
    insert into public.session_assignments (
      match_id, event_id, round, table_number, participant_id
    ) values (
      p_match_id, p_event_id, v_assignment_round, v_replacement_table, p_missing_participant
    );
  end if;

  return jsonb_build_object(
    'phase', p_phase,
    'missing_participant', p_missing_participant,
    'replacement_participant', p_replacement_participant,
    'missing_partner', p_expected_missing_partner,
    'replacement_partner', p_expected_replacement_partner,
    'first_score', v_first_total,
    'second_score', v_second_total,
    'assignment_round', v_assignment_round
  );
end;
$$;

revoke all on function public.swap_event3_match_partner(
  uuid, integer, text, integer, integer, integer, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.swap_event3_match_partner(
  uuid, integer, text, integer, integer, integer, integer, jsonb, jsonb
) to service_role;

commit;
