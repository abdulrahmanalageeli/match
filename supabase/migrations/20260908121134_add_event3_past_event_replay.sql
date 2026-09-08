-- Replay a completed Event3 edition inside the existing reversible test sandbox.
-- The historical edition is a read-only source. Every copied row is written to
-- the active event id and is removed when the pre-test runtime is restored.

create or replace function public.begin_event3_past_event_replay_v1(
  p_event_id integer,
  p_source_event_id integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match_id constant uuid := '00000000-0000-0000-0000-000000000003'::uuid;
  v_attendance_match_id constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_state public.event_state%rowtype;
  v_source_numbers integer[];
  v_source_count integer;
  v_source_format text;
  v_target_format text;
  v_target_setting_existed boolean;
  v_started jsonb;
  v_started_at text;
  v_replay_metadata jsonb;
begin
  if p_event_id is null or p_event_id <= 0
     or p_source_event_id is null or p_source_event_id <= 0
     or p_source_event_id = p_event_id then
    raise exception 'Replay requires distinct positive current and source event ids'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = v_match_id
  for update;

  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Event3 is not configured for current event %', p_event_id
      using errcode = '55000';
  end if;
  if v_state.test_mode_active is true then
    raise exception 'End the active Event3 test session before starting a replay'
      using errcode = '55000';
  end if;

  select pg_catalog.array_agg(roster.participant_number order by roster.position),
         pg_catalog.count(*)::integer
    into v_source_numbers, v_source_count
  from public.event3_participants roster
  where roster.match_id = v_match_id
    and roster.event_id = p_source_event_id;

  if coalesce(v_source_count, 0) < 6
     or v_source_count > 44
     or pg_catalog.mod(v_source_count, 2) <> 0 then
    raise exception 'The saved event needs an even roster of 6 to 44 participants to replay safely'
      using errcode = '22023';
  end if;

  select coalesce(settings.event_format, 'classic') into v_source_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = v_match_id
   and settings.event_id = p_source_event_id;
  if v_source_format not in ('classic', 'choice_only_three_groups') then
    raise exception 'The saved event uses an unsupported Event3 format'
      using errcode = '22023';
  end if;

  select exists(
    select 1 from public.event3_event_settings settings
    where settings.match_id = v_match_id and settings.event_id = p_event_id
  ) into v_target_setting_existed;
  select coalesce(settings.event_format, 'classic') into v_target_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = v_match_id and settings.event_id = p_event_id;

  -- The core test-mode function deliberately requires 36 people for a newly
  -- generated classic test. Historical classic editions used flexible even
  -- rosters, so admit the saved roster through the choice-size validator only
  -- for this transaction, then immediately restore the source edition format.
  insert into public.event3_event_settings(
    match_id, event_id, event_format, created_at, updated_at
  ) values (
    v_match_id, p_event_id, 'choice_only_three_groups',
    pg_catalog.now(), pg_catalog.now()
  )
  on conflict (match_id, event_id) do update
    set event_format = excluded.event_format,
        updated_at = excluded.updated_at;

  v_started := public.begin_event3_test_mode(
    p_event_id,
    v_source_numbers
  );
  delete from public.event3_group_member_feedback feedback
  where feedback.match_id = v_match_id
    and feedback.event_id = p_event_id
    and feedback.is_test_mode = true;

  select state.test_mode_snapshot ->> 'started_at' into v_started_at
  from public.event_state state
  where state.match_id = v_match_id;
  if nullif(v_started_at, '') is null then
    raise exception 'The replay test session did not produce a session key'
      using errcode = '55000';
  end if;

  v_replay_metadata := pg_catalog.jsonb_build_object(
    'source_event_id', p_source_event_id,
    'source_event_format', v_source_format,
    'source_participant_count', v_source_count,
    'target_setting_existed', v_target_setting_existed,
    'target_event_format', v_target_format
  );

  update public.event3_test_mode_snapshots saved
  set snapshot = saved.snapshot || pg_catalog.jsonb_build_object(
    'event3_replay', v_replay_metadata
  )
  where saved.match_id = v_match_id and saved.event_id = p_event_id;

  update public.event_state state
  set test_mode_snapshot = state.test_mode_snapshot || pg_catalog.jsonb_build_object(
    'replay_source_event_id', p_source_event_id,
    'replay_source_event_format', v_source_format,
    'replay_source_participant_count', v_source_count
  )
  where state.match_id = v_match_id;

  insert into public.event3_event_settings(
    match_id, event_id, event_format, created_at, updated_at
  ) values (
    v_match_id, p_event_id, v_source_format,
    pg_catalog.now(), pg_catalog.now()
  )
  on conflict (match_id, event_id) do update
    set event_format = excluded.event_format,
        updated_at = excluded.updated_at;

  -- Replace the generated sandbox roster with an exact logical copy. Primary
  -- keys are intentionally regenerated so no copied row can alias its source.
  delete from public.event3_participants roster
  where roster.match_id = v_match_id and roster.event_id = p_event_id;
  insert into public.event3_participants(
    match_id, event_id, participant_number, position, created_at, phase2_excluded
  )
  select v_match_id, p_event_id, source.participant_number, source.position,
         source.created_at, source.phase2_excluded
  from public.event3_participants source
  where source.match_id = v_match_id and source.event_id = p_source_event_id
  order by source.position;

  insert into public.event3_matches(
    match_id, event_id, participant_number,
    phase2_partner, phase3_partner, phase4_partner,
    phase2_word, phase3_word, phase4_word,
    phase2_score, phase3_score, phase4_score,
    phase2_feedback, phase3_feedback, phase4_feedback,
    match_preference,
    phase2_score_model_version, phase2_score_snapshot, phase2_score_content_hash,
    phase3_score_model_version, phase3_score_snapshot, phase3_score_content_hash,
    phase4_score_model_version, phase4_score_snapshot, phase4_score_content_hash,
    created_at, updated_at
  )
  select v_match_id, p_event_id, source.participant_number,
         source.phase2_partner, source.phase3_partner, source.phase4_partner,
         source.phase2_word, source.phase3_word, source.phase4_word,
         source.phase2_score, source.phase3_score, source.phase4_score,
         source.phase2_feedback, source.phase3_feedback, source.phase4_feedback,
         source.match_preference,
         source.phase2_score_model_version, source.phase2_score_snapshot, source.phase2_score_content_hash,
         source.phase3_score_model_version, source.phase3_score_snapshot, source.phase3_score_content_hash,
         source.phase4_score_model_version, source.phase4_score_snapshot, source.phase4_score_content_hash,
         source.created_at, source.updated_at
  from public.event3_matches source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.session_assignments(
    match_id, event_id, round, table_number, participant_id, created_at
  )
  select v_match_id, p_event_id, source.round, source.table_number,
         source.participant_id, source.created_at
  from public.session_assignments source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.participant_rankings(
    match_id, event_id, ranker_number, ranked_number, rank, submitted_at, auto_saved
  )
  select v_match_id, p_event_id, source.ranker_number, source.ranked_number,
         source.rank, source.submitted_at, source.auto_saved
  from public.participant_rankings source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.event3_participant_notes(
    match_id, event_id, participant_number, about_number, phase, note, created_at
  )
  select v_match_id, p_event_id, source.participant_number, source.about_number,
         source.phase, source.note, source.created_at
  from public.event3_participant_notes source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.event3_mood_checks(
    match_id, event_id, check_id, participant_number, mood, triggered_at, answered_at
  )
  select v_match_id, p_event_id,
         'replay:' || v_started_at || ':' || source.check_id,
         source.participant_number, source.mood, source.triggered_at, source.answered_at
  from public.event3_mood_checks source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.event3_notifications(
    match_id, event_id, notif_id, participant_number,
    title, body, icon, created_at, seen_at
  )
  select v_match_id, p_event_id,
         'replay:' || v_started_at || ':' || source.notif_id,
         source.participant_number, source.title, source.body, source.icon,
         source.created_at, source.seen_at
  from public.event3_notifications source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.event3_ai_welcome_messages(
    match_id, event_id, participant_number, welcome_message,
    generated_at, generated_by, anchor_used
  )
  select v_match_id, p_event_id, source.participant_number,
         source.welcome_message, source.generated_at, source.generated_by,
         source.anchor_used
  from public.event3_ai_welcome_messages source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.event3_exclusions(
    match_id, event_id, participant_a_number, participant_b_number, reason, created_at
  )
  select v_match_id, p_event_id, source.participant_a_number,
         source.participant_b_number, source.reason, source.created_at
  from public.event3_exclusions source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.event3_group_reflections(
    match_id, event_id, ranker_number, ranked_numbers, organizer_note,
    source_phase, submitted_at, updated_at, group_round
  )
  select v_match_id, p_event_id, source.ranker_number, source.ranked_numbers,
         source.organizer_note, source.source_phase, source.submitted_at,
         source.updated_at, source.group_round
  from public.event3_group_reflections source
  where source.match_id = v_match_id and source.event_id = p_source_event_id;

  insert into public.event_attendance(
    match_id, event_id, participant_number, attended, updated_at, updated_by
  )
  select v_attendance_match_id, p_event_id, source.participant_number,
         source.attended, source.updated_at, source.updated_by
  from public.event_attendance source
  where source.match_id = v_attendance_match_id
    and source.event_id = p_source_event_id;

  insert into public.organizer_requests(
    event_id, participant_token, participant_number, participant_name,
    table_info, message, organizer_reply, status, request_type,
    chat_history, created_at, updated_at
  )
  select p_event_id, source.participant_token, source.participant_number,
         source.participant_name, source.table_info, source.message,
         source.organizer_reply, source.status, source.request_type,
         source.chat_history, source.created_at, source.updated_at
  from public.organizer_requests source
  where source.event_id = p_source_event_id;

  insert into public.event3_group_member_feedback(
    match_id, event_id, group_round, reviewer_number, member_number,
    experience, tags, organizer_note, is_test_mode, submitted_at, updated_at
  )
  select v_match_id, p_event_id, source.group_round, source.reviewer_number,
         source.member_number, source.experience, source.tags,
         source.organizer_note, true, source.submitted_at, source.updated_at
  from public.event3_group_member_feedback source
  where source.match_id = v_match_id
    and source.event_id = p_source_event_id
    and source.is_test_mode = false;

  insert into public.event3_cohost_notes(
    match_id, event_id, test_mode, test_session_key,
    scope_type, scope_key, round, table_number,
    participant_number, participant2_number, note, updated_by,
    created_at, updated_at
  )
  select v_match_id, p_event_id, true, v_started_at,
         source.scope_type, source.scope_key, source.round, source.table_number,
         source.participant_number, source.participant2_number,
         source.note, source.updated_by, source.created_at, source.updated_at
  from public.event3_cohost_notes source
  where source.match_id = v_match_id
    and source.event_id = p_source_event_id
    and source.test_mode = false
    and source.test_session_key = '';

  insert into public.event3_ranking_drafts(
    match_id, event_id, ranker_number, completed_rounds, session_key,
    ranked_numbers, revision, submitted, updated_at
  )
  select v_match_id, p_event_id, source.ranker_number,
         source.completed_rounds, v_started_at, source.ranked_numbers,
         source.revision, source.submitted, source.updated_at
  from public.event3_ranking_drafts source
  where source.match_id = v_match_id
    and source.event_id = p_source_event_id
    and source.session_key = 'live';

  insert into public.event3_choice_seating_reports(
    match_id, event_id, is_test_mode, session_key,
    candidate_id, candidate_rank, generator_version, context_hash,
    report, assignments, created_at
  )
  select v_match_id, p_event_id, true, v_started_at,
         source.candidate_id, source.candidate_rank, source.generator_version,
         source.context_hash, source.report, source.assignments, source.created_at
  from public.event3_choice_seating_reports source
  where source.match_id = v_match_id
    and source.event_id = p_source_event_id
    and source.is_test_mode = false
    and source.session_key = 'live';

  -- Session-scoped coordination is copied last so vote foreign keys always
  -- point at the replay's own coordination rows.
  delete from public.event3_group_coordinator_votes votes
  where votes.match_id = v_match_id and votes.event_id = p_event_id
    and votes.session_key = 'test:' || v_started_at;
  delete from public.event3_group_coordination coordination
  where coordination.match_id = v_match_id and coordination.event_id = p_event_id
    and coordination.session_key = 'test:' || v_started_at;

  insert into public.event3_group_coordination(
    match_id, event_id, session_key, round, table_number,
    election_version, election_status, election_kind,
    election_started_at, election_deadline, coordinator_number,
    previous_coordinator_number, elected_at, active_content,
    content_version, content_updated_at, content_updated_by, updated_at
  )
  select v_match_id, p_event_id, 'test:' || v_started_at,
         source.round, source.table_number, source.election_version,
         source.election_status, source.election_kind,
         source.election_started_at, source.election_deadline,
         source.coordinator_number, source.previous_coordinator_number,
         source.elected_at, source.active_content, source.content_version,
         source.content_updated_at, source.content_updated_by, source.updated_at
  from public.event3_group_coordination source
  where source.match_id = v_match_id
    and source.event_id = p_source_event_id
    and source.session_key = 'live';

  insert into public.event3_group_coordinator_votes(
    match_id, event_id, session_key, round, table_number,
    election_version, voter_number, candidate_number, created_at, updated_at
  )
  select v_match_id, p_event_id, 'test:' || v_started_at,
         source.round, source.table_number, source.election_version,
         source.voter_number, source.candidate_number,
         source.created_at, source.updated_at
  from public.event3_group_coordinator_votes source
  where source.match_id = v_match_id
    and source.event_id = p_source_event_id
    and source.session_key = 'live';

  return coalesce(v_started, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'replay_source_event_id', p_source_event_id,
    'replay_source_event_format', v_source_format,
    'replay_source_participant_count', v_source_count,
    'started_at', v_started_at,
    'copied', pg_catalog.jsonb_build_object(
      'participants', (select pg_catalog.count(*) from public.event3_participants row_data where row_data.match_id = v_match_id and row_data.event_id = p_event_id),
      'assignments', (select pg_catalog.count(*) from public.session_assignments row_data where row_data.match_id = v_match_id and row_data.event_id = p_event_id),
      'rankings', (select pg_catalog.count(*) from public.participant_rankings row_data where row_data.match_id = v_match_id and row_data.event_id = p_event_id),
      'matches', (select pg_catalog.count(*) from public.event3_matches row_data where row_data.match_id = v_match_id and row_data.event_id = p_event_id)
    )
  );
end;
$$;

-- v3 adds replay-format restoration and cleans the session-scoped group
-- coordination rows introduced after the original reversible test migration.
create or replace function public.end_event3_test_mode_v3(
  p_event_id integer,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match_id constant uuid := '00000000-0000-0000-0000-000000000003'::uuid;
  v_snapshot jsonb;
  v_replay jsonb;
  v_result jsonb;
  v_replay_source_event_id integer;
begin
  if nullif(pg_catalog.btrim(p_expected_started_at), '') is null then
    raise exception 'The expected Event3 test session is required'
      using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, true, pg_catalog.btrim(p_expected_started_at)
  );
  select saved.snapshot into v_snapshot
  from public.event3_test_mode_snapshots saved
  where saved.match_id = v_match_id and saved.event_id = p_event_id
  for update;
  if v_snapshot is null then
    raise exception 'The Event3 test snapshot is missing; nothing was changed'
      using errcode = '55000';
  end if;
  v_replay := v_snapshot -> 'event3_replay';
  v_replay_source_event_id := nullif(v_replay ->> 'source_event_id', '')::integer;

  delete from public.event3_group_coordinator_votes votes
  where votes.match_id = v_match_id and votes.event_id = p_event_id
    and votes.session_key = 'test:' || pg_catalog.btrim(p_expected_started_at);
  delete from public.event3_group_coordination coordination
  where coordination.match_id = v_match_id and coordination.event_id = p_event_id
    and coordination.session_key = 'test:' || pg_catalog.btrim(p_expected_started_at);

  v_result := public.end_event3_test_mode_with_group_feedback(p_event_id);

  if pg_catalog.jsonb_typeof(v_replay) = 'object' then
    if coalesce((v_replay ->> 'target_setting_existed')::boolean, false) then
      insert into public.event3_event_settings(
        match_id, event_id, event_format, created_at, updated_at
      ) values (
        v_match_id,
        p_event_id,
        coalesce(v_replay ->> 'target_event_format', 'classic'),
        pg_catalog.now(),
        pg_catalog.now()
      )
      on conflict (match_id, event_id) do update
        set event_format = excluded.event_format,
            updated_at = excluded.updated_at;
    else
      delete from public.event3_event_settings settings
      where settings.match_id = v_match_id and settings.event_id = p_event_id;
    end if;
  end if;

  return coalesce(v_result, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'replay_source_event_id', v_replay_source_event_id,
    'replay_source_preserved', v_replay_source_event_id is not null,
    'event_format_restored', pg_catalog.jsonb_typeof(v_replay) = 'object'
  );
end;
$$;

-- Keep the established endpoint compatible while routing every new and
-- already-running test session through the stronger cleanup path.
create or replace function public.end_event3_test_mode_v2(
  p_event_id integer,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.end_event3_test_mode_v3(p_event_id, p_expected_started_at);
end;
$$;

comment on function public.begin_event3_past_event_replay_v1(integer, integer) is
  'Copies a saved Event3 edition into the reversible active-event test sandbox without modifying the source edition.';
comment on function public.end_event3_test_mode_v3(integer, text) is
  'Ends standard or replay Event3 test mode, restores the live runtime and format, and removes session-scoped test coordination.';

revoke all on function public.begin_event3_past_event_replay_v1(integer, integer)
  from public, anon, authenticated;
revoke all on function public.end_event3_test_mode_v3(integer, text)
  from public, anon, authenticated;
revoke all on function public.end_event3_test_mode_v2(integer, text)
  from public, anon, authenticated;
grant execute on function public.begin_event3_past_event_replay_v1(integer, integer)
  to service_role;
grant execute on function public.end_event3_test_mode_v3(integer, text)
  to service_role;
grant execute on function public.end_event3_test_mode_v2(integer, text)
  to service_role;
