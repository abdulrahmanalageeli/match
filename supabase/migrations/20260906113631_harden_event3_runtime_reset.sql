-- Make a live Event3 reset indistinguishable from a fresh runtime while
-- preserving reusable computation caches and durable event configuration.
set local lock_timeout = '5s';

alter table public.event_state
  add column if not exists event3_runtime_generation bigint not null default 1;

alter table public.event_state
  drop constraint if exists event_state_event3_runtime_generation_check;

alter table public.event_state
  add constraint event_state_event3_runtime_generation_check
  check (event3_runtime_generation > 0);

comment on column public.event_state.event3_runtime_generation is
  'Monotonic Event3 reset generation used to isolate harmless browser caches from a new live runtime.';

create or replace function public.reset_event3_runtime_v2(
  p_match_id uuid,
  p_event_id integer,
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
  v_session_key text;
  v_coordination_session_key text;
  v_runtime_generation bigint;
begin
  if p_match_id is null or p_event_id is null or p_event_id <= 0 then
    raise exception 'A valid Event3 runtime is required' using errcode = '22023';
  end if;
  if coalesce(p_expected_test_mode, false)
     and nullif(pg_catalog.btrim(coalesce(p_expected_started_at, '')), '') is null then
    raise exception 'The expected Event3 test session is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_match_id::text || ':' || p_event_id::text || ':event3-runtime', 0)
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = p_match_id
  for update;

  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Event3 reset requires the active current event' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from coalesce(p_expected_test_mode, false)
     or (coalesce(p_expected_test_mode, false) and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '')
         is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before reset' using errcode = '55000';
  end if;

  v_session_key := case
    when coalesce(p_expected_test_mode, false) then p_expected_started_at
    else 'live'
  end;
  v_coordination_session_key := case
    when coalesce(p_expected_test_mode, false) then 'test:' || p_expected_started_at
    else 'live'
  end;

  -- Every mutable surface is locked before the first delete. A concurrent
  -- participant/admin mutation therefore finishes before the reset or waits
  -- until the fresh generation is visible; no partial reset can commit.
  lock table
    public.event3_group_coordinator_votes,
    public.event3_group_coordination,
    public.event3_choice_seating_reports,
    public.event3_cohost_notes,
    public.event3_group_member_feedback,
    public.event3_group_reflections,
    public.event3_participant_notes,
    public.event3_mood_checks,
    public.event3_notifications,
    public.event3_ai_welcome_messages,
    public.event3_test_match_results,
    public.organizer_requests,
    public.event_attendance,
    public.participant_rankings,
    public.event3_ranking_drafts,
    public.session_assignments,
    public.event3_matches,
    public.event3_exclusions,
    public.event3_participants
  in share row exclusive mode;

  -- Coordinator ballots are deleted explicitly even though the parent row
  -- also cascades, making the reset contract obvious and independently safe.
  delete from public.event3_group_coordinator_votes vote
  where vote.match_id = p_match_id
    and vote.event_id = p_event_id
    and vote.session_key = v_coordination_session_key;
  delete from public.event3_group_coordination coordination
  where coordination.match_id = p_match_id
    and coordination.event_id = p_event_id
    and coordination.session_key = v_coordination_session_key;

  delete from public.event3_choice_seating_reports report
  where report.match_id = p_match_id
    and report.event_id = p_event_id
    and report.is_test_mode = coalesce(p_expected_test_mode, false)
    and report.session_key = v_session_key;
  delete from public.event3_cohost_notes note
  where note.match_id = p_match_id
    and note.event_id = p_event_id
    and note.test_mode = coalesce(p_expected_test_mode, false)
    and (
      not coalesce(p_expected_test_mode, false)
      or note.test_session_key = v_session_key
    );
  delete from public.event3_group_member_feedback feedback
  where feedback.match_id = p_match_id
    and feedback.event_id = p_event_id
    and feedback.is_test_mode = coalesce(p_expected_test_mode, false);

  -- These tables represent whichever live/test runtime currently owns the
  -- event id. Test-mode lifecycle snapshots restore the untouched live rows.
  delete from public.event3_group_reflections
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_participant_notes
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_mood_checks
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_notifications
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_ai_welcome_messages
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.organizer_requests
  where event_id = p_event_id;
  delete from public.event_attendance
  where match_id = '00000000-0000-0000-0000-000000000000'::uuid
    and event_id = p_event_id;

  delete from public.participant_rankings
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_ranking_drafts draft
  where draft.match_id = p_match_id
    and draft.event_id = p_event_id
    and draft.session_key = v_session_key;
  delete from public.session_assignments
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_matches
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_exclusions
  where match_id = p_match_id and event_id = p_event_id;
  delete from public.event3_participants
  where match_id = p_match_id and event_id = p_event_id;

  if coalesce(p_expected_test_mode, false) then
    delete from public.event3_test_match_results
    where match_id = p_match_id and event_id = p_event_id;
  end if;

  update public.event_state
  set phase = 'setup',
      announcement = null,
      announcement_type = null,
      announcement_time = null,
      emergency_paused = false,
      pause_time = null,
      current_round = 1,
      global_timer_active = false,
      global_timer_start_time = null,
      global_timer_duration = null,
      global_timer_round = null,
      results_visible = false,
      groups_locked = false,
      phase2_score_revealed = false,
      phase3_score_revealed = false,
      cohost_locked = false,
      cohost_lock_updated_at = null,
      cohost_lock_updated_by = null,
      event3_participant_access_locked = false,
      test_mode_snapshot = case
        when coalesce(p_expected_test_mode, false) then test_mode_snapshot
        else null
      end,
      event3_runtime_generation = coalesce(event3_runtime_generation, 1) + 1
  where match_id = p_match_id
  returning event3_runtime_generation into v_runtime_generation;

  -- Fail the transaction instead of ever claiming success with visible
  -- residue. Durable settings, agreements, source profiles, upstream locked
  -- matches, and computation caches are intentionally outside this check.
  if exists (
    select 1 from public.event3_group_coordination
      where match_id = p_match_id and event_id = p_event_id
        and session_key = v_coordination_session_key
    union all
    select 1 from public.event3_choice_seating_reports
      where match_id = p_match_id and event_id = p_event_id
        and is_test_mode = coalesce(p_expected_test_mode, false) and session_key = v_session_key
    union all
    select 1 from public.event3_cohost_notes
      where match_id = p_match_id and event_id = p_event_id
        and test_mode = coalesce(p_expected_test_mode, false)
        and (not coalesce(p_expected_test_mode, false) or test_session_key = v_session_key)
    union all
    select 1 from public.event3_group_member_feedback
      where match_id = p_match_id and event_id = p_event_id
        and is_test_mode = coalesce(p_expected_test_mode, false)
    union all
    select 1 from public.event3_group_reflections
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_participant_notes
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_mood_checks
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_notifications
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_ai_welcome_messages
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.organizer_requests where event_id = p_event_id
    union all
    select 1 from public.event_attendance
      where match_id = '00000000-0000-0000-0000-000000000000'::uuid and event_id = p_event_id
    union all
    select 1 from public.participant_rankings
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_ranking_drafts
      where match_id = p_match_id and event_id = p_event_id and session_key = v_session_key
    union all
    select 1 from public.session_assignments
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_matches
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_exclusions
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_participants
      where match_id = p_match_id and event_id = p_event_id
    union all
    select 1 from public.event3_test_match_results
      where coalesce(p_expected_test_mode, false)
        and match_id = p_match_id and event_id = p_event_id
  ) then
    raise exception 'Event3 reset verification found runtime residue' using errcode = '55000';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'test_mode', coalesce(p_expected_test_mode, false),
    'runtime_generation', v_runtime_generation,
    'cache_preserved', true
  );
end;
$$;

revoke all on function public.reset_event3_runtime_v2(uuid, integer, boolean, text)
  from public, anon, authenticated;
grant execute on function public.reset_event3_runtime_v2(uuid, integer, boolean, text)
  to service_role;
