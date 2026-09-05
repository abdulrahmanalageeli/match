-- Allow flexible choice-only test rosters and make test mode reversible for
-- every participant/admin surface that shares the live event id.
-- This migration cannot safely adopt a test session started by the previous
-- implementation because that session never captured the auxiliary tables.
-- Fail before replacing any functions so operations can end that test first.
do $$
declare
  v_active boolean := false;
  v_event_id integer;
  v_snapshot jsonb;
begin
  select coalesce(state.test_mode_active, false), state.current_event_id
    into v_active, v_event_id
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid;

  if found then
    if v_event_id is not null and v_event_id > 0 then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('event3-test-mode:' || v_event_id::text, 0)
      );
    end if;
    select coalesce(state.test_mode_active, false), state.current_event_id
      into v_active, v_event_id
    from public.event_state state
    where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    for update;
  end if;

  if v_active then
    if v_event_id is null or v_event_id <= 0 then
      raise exception 'End the active legacy Event3 test session before applying this migration'
        using errcode = '55000';
    end if;
    select saved.snapshot into v_snapshot
    from public.event3_test_mode_snapshots saved
    where saved.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and saved.event_id = v_event_id;

    if v_snapshot is null
       or not coalesce(v_snapshot ? 'event_attendance', false)
       or not coalesce(v_snapshot ? 'organizer_requests', false)
       or not coalesce(v_snapshot ? 'event3_group_reflections', false) then
      raise exception 'End the active legacy Event3 test session before applying this migration'
        using errcode = '55000';
    end if;
  end if;
end;
$$;

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
  v_event_format text;
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

  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Event3 is not configured for event %', p_event_id;
  end if;
  if v_state.test_mode_active is true then
    raise exception 'Event3 test mode is already active';
  end if;

  -- The format is read only after taking the state lock shared with the
  -- atomic format setter, so a concurrent switch cannot admit the wrong
  -- roster size into a new test session.
  select coalesce(settings.event_format, 'classic')
    into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = v_state.match_id and settings.event_id = p_event_id;
  v_selected_count := coalesce(pg_catalog.array_length(p_participant_numbers, 1), 0);
  if (
       (v_event_format = 'choice_only_three_groups'
        and (v_selected_count < 16 or v_selected_count > 42 or v_selected_count % 2 <> 0))
       or (v_event_format <> 'choice_only_three_groups' and v_selected_count <> 36)
     )
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
    raise exception 'Test mode requires 36 unique participants for classic events, or an even 16 to 42 for choice-only events';
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
    ), '[]'::jsonb),
    'event3_group_reflections', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.event3_group_reflections row_data
      where row_data.match_id = v_state.match_id and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'event_attendance', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.participant_number)
      from public.event_attendance row_data
      where row_data.match_id = '00000000-0000-0000-0000-000000000000'::uuid
        and row_data.event_id = p_event_id
    ), '[]'::jsonb),
    'organizer_requests', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) order by row_data.id::text)
      from public.organizer_requests row_data
      where row_data.event_id = p_event_id
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

  -- Mark the new test session active before deleting live runtime rows. The
  -- ranking invalidation trigger derives its draft session from event_state;
  -- without this ordering, deleting snapshotted live ballots would submit the
  -- preserved live drafts that test mode promises not to touch.
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
  delete from public.event3_group_reflections
  where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event_attendance
  where match_id = '00000000-0000-0000-0000-000000000000'::uuid
    and event_id = p_event_id;
  delete from public.organizer_requests
  where event_id = p_event_id;
  delete from public.event3_choice_seating_reports
  where match_id = v_state.match_id and event_id = p_event_id and is_test_mode = true;
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

  return pg_catalog.jsonb_build_object(
    'success', true,
    'selected_count', v_selected_count,
    'snapshot_version', 1
  );
end;
$$;

alter function public.end_event3_test_mode(integer)
  rename to end_event3_test_mode_core;

-- Restore the auxiliary live rows before the original runtime restorer removes
-- the snapshot. The entire operation remains one transaction.
create or replace function public.end_event3_test_mode(p_event_id integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_snapshot jsonb;
  v_result jsonb;
  v_session_key text;
  v_deleted_cohost_notes integer := 0;
  v_deleted_ranking_drafts integer := 0;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
  for update;
  if not found or v_state.current_event_id is distinct from p_event_id
     or v_state.test_mode_active is not true then
    raise exception 'Event3 test mode is not active for event %', p_event_id;
  end if;
  v_session_key := coalesce(v_state.test_mode_snapshot ->> 'started_at', 'legacy-test');
  select saved.snapshot into v_snapshot
  from public.event3_test_mode_snapshots saved
  where saved.match_id = v_state.match_id and saved.event_id = p_event_id
  for update;

  if v_snapshot ? 'event3_group_reflections' then
    delete from public.event3_group_reflections
    where match_id = v_state.match_id and event_id = p_event_id;
    insert into public.event3_group_reflections
    select restored.*
    from pg_catalog.jsonb_populate_recordset(
      null::public.event3_group_reflections,
      coalesce(v_snapshot -> 'event3_group_reflections', '[]'::jsonb)
    ) restored;
  end if;

  if v_snapshot ? 'event_attendance' then
    delete from public.event_attendance
    where match_id = '00000000-0000-0000-0000-000000000000'::uuid
      and event_id = p_event_id;
    insert into public.event_attendance
    select restored.*
    from pg_catalog.jsonb_populate_recordset(
      null::public.event_attendance,
      coalesce(v_snapshot -> 'event_attendance', '[]'::jsonb)
    ) restored;
  end if;

  if v_snapshot ? 'organizer_requests' then
    delete from public.organizer_requests
    where event_id = p_event_id;
    insert into public.organizer_requests
    select restored.*
    from pg_catalog.jsonb_populate_recordset(
      null::public.organizer_requests,
      coalesce(v_snapshot -> 'organizer_requests', '[]'::jsonb)
    ) restored;
  end if;

  delete from public.event3_choice_seating_reports
  where match_id = v_state.match_id and event_id = p_event_id and is_test_mode = true;

  delete from public.event3_cohost_notes
  where match_id = v_state.match_id and event_id = p_event_id
    and test_mode = true and test_session_key = v_session_key;
  get diagnostics v_deleted_cohost_notes = row_count;

  delete from public.event3_ranking_drafts
  where match_id = v_state.match_id and event_id = p_event_id
    and session_key = v_session_key;
  get diagnostics v_deleted_ranking_drafts = row_count;

  v_result := public.end_event3_test_mode_core(p_event_id);
  return coalesce(v_result, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'auxiliary_runtime_restored', v_snapshot ? 'event_attendance',
    'cohost_notes_deleted', v_deleted_cohost_notes,
    'ranking_drafts_deleted', v_deleted_ranking_drafts
  );
end;
$$;

create or replace function public.end_event3_test_mode_with_group_feedback(p_event_id integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_deleted_feedback integer := 0;
begin
  v_result := public.end_event3_test_mode(p_event_id);
  delete from public.event3_group_member_feedback
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and event_id = p_event_id
    and is_test_mode = true;
  get diagnostics v_deleted_feedback = row_count;
  return v_result || pg_catalog.jsonb_build_object('group_feedback_deleted', v_deleted_feedback);
end;
$$;

create or replace function public.clear_event3_test_data(p_event_id integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
  v_snapshot jsonb;
  v_session_key text;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );
  select state.* into v_state from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid for update;
  if not found or v_state.current_event_id is distinct from p_event_id
     or v_state.test_mode_active is not true then
    raise exception 'Test data can only be cleared for the active current test event';
  end if;
  select saved.snapshot into v_snapshot
  from public.event3_test_mode_snapshots saved
  where saved.match_id = v_state.match_id and saved.event_id = p_event_id;
  v_session_key := coalesce(v_state.test_mode_snapshot ->> 'started_at', 'legacy-test');

  delete from public.participant_rankings where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_group_member_feedback
  where match_id = v_state.match_id and event_id = p_event_id and is_test_mode = true;
  delete from public.event3_participant_notes where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_mood_checks where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_notifications where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_ai_welcome_messages where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_test_match_results where match_id = v_state.match_id and event_id = p_event_id;
  delete from public.event3_cohost_notes
  where match_id = v_state.match_id and event_id = p_event_id
    and test_mode = true and test_session_key = v_session_key;
  delete from public.event3_ranking_drafts
  where match_id = v_state.match_id and event_id = p_event_id
    and session_key = v_session_key;
  delete from public.event3_choice_seating_reports
  where match_id = v_state.match_id and event_id = p_event_id and is_test_mode = true;

  if coalesce(v_snapshot, '{}'::jsonb) ? 'event3_group_reflections' then
    delete from public.event3_group_reflections where match_id = v_state.match_id and event_id = p_event_id;
  end if;
  if coalesce(v_snapshot, '{}'::jsonb) ? 'event_attendance' then
    delete from public.event_attendance
    where match_id = '00000000-0000-0000-0000-000000000000'::uuid and event_id = p_event_id;
  end if;
  if coalesce(v_snapshot, '{}'::jsonb) ? 'organizer_requests' then
    delete from public.organizer_requests where event_id = p_event_id;
  end if;

  update public.event3_matches
  set phase2_feedback = null, phase3_feedback = null, phase4_feedback = null,
      phase2_word = null, phase3_word = null, phase4_word = null,
      match_preference = null
  where match_id = v_state.match_id and event_id = p_event_id;

  return pg_catalog.jsonb_build_object('success', true, 'event_id', p_event_id);
end;
$$;

-- Auxiliary rows share the live event id between real and test sessions. Route
-- every mutation through the event-state lock so a request that began in one
-- session cannot commit after begin/end test mode switches the runtime.
create or replace function public.assert_event3_auxiliary_session(
  p_event_id integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.event_state%rowtype;
begin
  if p_event_id is null or p_event_id <= 0 or p_expected_test_mode is null then
    raise exception 'A valid Event3 session context is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-test-mode:' || p_event_id::text, 0)
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
  for update;

  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'The active Event3 event changed before the request was saved' using errcode = '55000';
  end if;
  if coalesce(v_state.test_mode_active, false) is distinct from p_expected_test_mode
     or (p_expected_test_mode and
       coalesce(v_state.test_mode_snapshot ->> 'started_at', '')
         is distinct from coalesce(p_expected_started_at, '')) then
    raise exception 'The Event3 live/test session changed before the request was saved' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.set_event3_attendance_v2(
  p_event_id integer,
  p_participant_number integer,
  p_attended boolean,
  p_updated_by text,
  p_auto_join boolean,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.event_attendance%rowtype;
  v_changed boolean := false;
begin
  if p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     or p_attended is null or p_auto_join is null
     or p_updated_by is null
     or p_updated_by not in ('auto-join', 'event3-host', 'event3-cohost')
     or (p_auto_join and (p_updated_by <> 'auto-join' or p_attended is not true)) then
    raise exception 'Invalid Event3 attendance update' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_participant_number
  ) then
    raise exception 'Participant is not enrolled in the active Event3 roster' using errcode = '55000';
  end if;

  if p_auto_join then
    insert into public.event_attendance(
      match_id, event_id, participant_number, attended, updated_by, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      p_event_id, p_participant_number, true, 'auto-join', pg_catalog.clock_timestamp()
    )
    on conflict (match_id, event_id, participant_number) do nothing
    returning * into v_row;
    v_changed := found;

    if not v_changed then
      update public.event_attendance attendance
      set attended = true,
          updated_by = 'auto-join',
          updated_at = pg_catalog.clock_timestamp()
      where attendance.match_id = '00000000-0000-0000-0000-000000000000'::uuid
        and attendance.event_id = p_event_id
        and attendance.participant_number = p_participant_number
        and attendance.attended is false
        and attendance.updated_by = 'auto-join'
      returning attendance.* into v_row;
      v_changed := found;
    end if;

    if v_row.participant_number is null then
      select attendance.* into v_row
      from public.event_attendance attendance
      where attendance.match_id = '00000000-0000-0000-0000-000000000000'::uuid
        and attendance.event_id = p_event_id
        and attendance.participant_number = p_participant_number;
    end if;
  else
    insert into public.event_attendance(
      match_id, event_id, participant_number, attended, updated_by, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      p_event_id, p_participant_number, p_attended, p_updated_by, pg_catalog.clock_timestamp()
    )
    on conflict (match_id, event_id, participant_number) do update set
      attended = excluded.attended,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
    returning * into v_row;
    v_changed := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'participant_number', v_row.participant_number,
    'attended', v_row.attended,
    'changed', v_changed
  );
end;
$$;

create or replace function public.append_event3_support_message_v2(
  p_request_id text,
  p_event_id integer,
  p_message text,
  p_actor text,
  p_participant_number integer,
  p_table_info text,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(pg_catalog.btrim(p_request_id), '') is null
     or p_actor is null or p_actor not in ('user', 'host', 'cohost')
     or nullif(pg_catalog.btrim(p_message), '') is null
     or pg_catalog.char_length(p_message) > 2000
     or pg_catalog.char_length(coalesce(p_table_info, '')) > 500
     or (p_actor = 'user' and (
       p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     )) then
    raise exception 'Invalid Event3 support message' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if not exists (
    select 1 from public.organizer_requests request
    where request.id = pg_catalog.btrim(p_request_id)::uuid and request.event_id = p_event_id
  ) then
    raise exception 'Support request is outside this Event3 event' using errcode = 'P0002';
  end if;
  return public.append_event3_support_message(
    pg_catalog.btrim(p_request_id), p_event_id, p_message, p_actor, p_participant_number, p_table_info
  );
exception
  when invalid_text_representation then
    raise exception 'Invalid support request id' using errcode = '22023';
end;
$$;

create or replace function public.send_event3_support_message_v2(
  p_event_id integer,
  p_participant_number integer,
  p_participant_token text,
  p_participant_name text,
  p_table_info text,
  p_message text,
  p_request_type text,
  p_actor text,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id text;
  v_result jsonb;
  v_text text;
begin
  if p_actor is null or p_actor not in ('user', 'host')
     or p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     or nullif(pg_catalog.btrim(p_participant_token), '') is null
     or pg_catalog.char_length(p_participant_token) > 512
     or pg_catalog.char_length(coalesce(p_participant_name, '')) > 300
     or pg_catalog.char_length(coalesce(p_table_info, '')) > 500
     or pg_catalog.char_length(coalesce(p_message, '')) > 2000
     or coalesce(p_request_type, 'chat') not in ('chat', 'organizer_needed') then
    raise exception 'Invalid Event3 support request' using errcode = '22023';
  end if;
  v_text := coalesce(nullif(pg_catalog.btrim(p_message), ''), 'أحتاج مساعدة من المنظم');

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_participant_number
  ) then
    raise exception 'Participant is not enrolled in the active Event3 roster' using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'event3-support:' || p_event_id::text || ':' || pg_catalog.btrim(p_participant_token),
      0
    )
  );
  select request.id::text into v_id
  from public.organizer_requests request
  where request.participant_token = pg_catalog.btrim(p_participant_token)
    and request.participant_number = p_participant_number
    and request.event_id = p_event_id
    and request.status <> 'resolved'
  order by request.created_at desc
  limit 1
  for update;

  if v_id is not null then
    return public.append_event3_support_message(
      v_id,
      p_event_id,
      v_text,
      p_actor,
      case when p_actor = 'user' then p_participant_number else null end,
      p_table_info
    );
  end if;

  insert into public.organizer_requests(
    event_id, participant_token, participant_number, participant_name,
    table_info, message, organizer_reply, status, request_type, chat_history
  ) values (
    p_event_id,
    pg_catalog.btrim(p_participant_token),
    p_participant_number,
    p_participant_name,
    p_table_info,
    case when p_actor = 'user' then v_text else null end,
    case when p_actor = 'host' then v_text else null end,
    case when p_actor = 'user' then 'pending' else 'replied' end,
    coalesce(p_request_type, 'chat'),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'from', case when p_actor = 'user' then 'user' else 'organizer' end,
      'organizer_role', case when p_actor = 'host' then 'host' else null end,
      'text', v_text,
      'timestamp', pg_catalog.clock_timestamp()
    ))
  )
  returning pg_catalog.jsonb_build_object('id', id, 'status', status) into v_result;
  return v_result;
end;
$$;

create or replace function public.set_event3_support_status_v2(
  p_event_id integer,
  p_request_id text,
  p_status text,
  p_all_pending boolean,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_status is null or p_status not in ('seen', 'resolved') or p_all_pending is null
     or (not p_all_pending and nullif(pg_catalog.btrim(p_request_id), '') is null) then
    raise exception 'Invalid Event3 support status update' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );

  if p_all_pending then
    if p_status <> 'seen' then
      raise exception 'Bulk support updates may only mark pending requests as seen' using errcode = '22023';
    end if;
    update public.organizer_requests request
    set status = 'seen', updated_at = pg_catalog.clock_timestamp()
    where request.status = 'pending'
      and request.event_id = p_event_id;
  else
    update public.organizer_requests request
    set status = p_status, updated_at = pg_catalog.clock_timestamp()
    where request.id = pg_catalog.btrim(p_request_id)::uuid
      and request.event_id = p_event_id;
  end if;
  get diagnostics v_updated = row_count;
  if not p_all_pending and v_updated = 0 then
    raise exception 'Support request is outside this Event3 session' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('success', true, 'updated', v_updated);
exception
  when invalid_text_representation then
    raise exception 'Invalid support request id' using errcode = '22023';
end;
$$;

create or replace function public.reset_event3_support_requests_v2(
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
  v_deleted integer := 0;
begin
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  delete from public.organizer_requests request
  where request.event_id = p_event_id;
  get diagnostics v_deleted = row_count;
  return pg_catalog.jsonb_build_object('success', true, 'deleted', v_deleted);
end;
$$;

-- Reject a delayed End click from an older test session before the current
-- session is restored. The nested lifecycle function reuses the same
-- transaction-level advisory and event-state locks.
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
  if nullif(pg_catalog.btrim(p_expected_started_at), '') is null then
    raise exception 'The expected Event3 test session is required' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, true, pg_catalog.btrim(p_expected_started_at)
  );
  return public.end_event3_test_mode_with_group_feedback(p_event_id);
end;
$$;

create or replace function public.clear_event3_test_data_v2(
  p_event_id integer,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(pg_catalog.btrim(p_expected_started_at), '') is null then
    raise exception 'The expected Event3 test session is required' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, true, pg_catalog.btrim(p_expected_started_at)
  );
  return public.clear_event3_test_data(p_event_id);
end;
$$;

create or replace function public.toggle_event3_score_reveal_v2(
  p_event_id integer,
  p_which text,
  p_value boolean,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_which is null or p_which not in ('phase2', 'phase3') or p_value is null then
    raise exception 'Invalid Event3 score reveal update' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if p_which = 'phase2' then
    update public.event_state
    set phase2_score_revealed = p_value
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid;
  else
    update public.event_state
    set phase3_score_revealed = p_value
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid;
  end if;
  return pg_catalog.jsonb_build_object(
    'success', true, 'which', p_which, 'revealed', p_value
  );
end;
$$;

create or replace function public.toggle_event3_phase2_exclusion_v2(
  p_event_id integer,
  p_participant_number integer,
  p_expected_excluded boolean,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_format text;
  v_excluded boolean;
begin
  if p_participant_number is null or p_participant_number <= 0
     or p_participant_number = 9999 or p_expected_excluded is null then
    raise exception 'Invalid Event3 exclusion toggle' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = '00000000-0000-0000-0000-000000000003'::uuid
   and settings.event_id = p_event_id;
  if v_event_format = 'choice_only_three_groups' then
    raise exception 'Choice-only Event3 editions do not use phase 2 exclusions'
      using errcode = '55000';
  end if;

  update public.event3_participants roster
  set phase2_excluded = not p_expected_excluded
  where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and roster.event_id = p_event_id
    and roster.participant_number = p_participant_number
    and roster.phase2_excluded is not distinct from p_expected_excluded
  returning roster.phase2_excluded into v_excluded;
  if not found then
    if not exists (
      select 1 from public.event3_participants roster
      where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
        and roster.event_id = p_event_id
        and roster.participant_number = p_participant_number
    ) then
      raise exception 'Participant is not enrolled in the active Event3 roster'
        using errcode = 'P0002';
    end if;
    raise exception 'The participant exclusion changed before it was saved'
      using errcode = '55000';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'participant_number', p_participant_number,
    'phase2_excluded', v_excluded
  );
end;
$$;

create or replace function public.set_event3_phase_v2(
  p_event_id integer,
  p_phase text,
  p_start_timer boolean,
  p_timer_duration integer,
  p_timer_round integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_format text;
  v_duration integer;
  v_round integer;
  v_state public.event_state%rowtype;
begin
  if p_phase is null or p_phase not in (
    'setup', 'round1', 'ranking1', 'round2', 'ranking2',
    'round3', 'ranking3', 'phase2_processing', 'break',
    'phase2_reveal', 'phase3_processing', 'phase3_reveal',
    'phase4_processing', 'phase4_reveal', 'final_reveal'
  ) then
    raise exception 'Unknown Event3 phase' using errcode = '22023';
  end if;
  if p_start_timer is distinct from true
     and (p_timer_duration is not null or p_timer_round is not null) then
    raise exception 'Timer options require start_timer=true' using errcode = '22023';
  end if;
  if p_start_timer is true and (
    (p_timer_duration is not null and (p_timer_duration <= 0 or p_timer_duration > 14400))
    or (p_timer_round is not null and p_timer_round not between 0 and 7)
  ) then
    raise exception 'Invalid Event3 timer options' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = '00000000-0000-0000-0000-000000000003'::uuid
   and settings.event_id = p_event_id;
  if v_event_format <> 'choice_only_three_groups'
     and p_phase in ('round3', 'ranking3', 'phase4_processing', 'phase4_reveal') then
    raise exception 'This phase is only available in a choice-only Event3 edition'
      using errcode = '22023';
  end if;

  if p_start_timer is true then
    v_duration := coalesce(p_timer_duration, case p_phase
      when 'round1' then 1800
      when 'ranking1' then 180
      when 'round2' then 1500
      when 'ranking2' then 180
      when 'round3' then 1500
      when 'ranking3' then 180
      when 'break' then 600
      when 'phase2_reveal' then 1200
      when 'phase3_reveal' then 1200
      when 'phase4_reveal' then 1200
      else 1200
    end);
    v_round := coalesce(p_timer_round, 0);
    update public.event_state
    set phase = p_phase,
        global_timer_active = true,
        global_timer_start_time = pg_catalog.clock_timestamp(),
        global_timer_duration = v_duration,
        global_timer_round = v_round
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid
    returning * into v_state;
  elsif p_start_timer is false then
    update public.event_state
    set phase = p_phase,
        global_timer_active = false,
        global_timer_start_time = null,
        global_timer_duration = null,
        global_timer_round = null
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid
    returning * into v_state;
  else
    update public.event_state
    set phase = p_phase
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid
    returning * into v_state;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'phase', v_state.phase,
    'timer_active', coalesce(v_state.global_timer_active, false),
    'timer_start', v_state.global_timer_start_time,
    'timer_duration', v_state.global_timer_duration,
    'timer_round', v_state.global_timer_round
  );
end;
$$;

create or replace function public.start_event3_timer_v2(
  p_event_id integer,
  p_round integer,
  p_duration integer,
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
  v_phase_duration integer;
  v_duration integer;
begin
  if p_round is null or p_round not between 0 and 7
     or (p_duration is not null and (p_duration <= 0 or p_duration > 14400)) then
    raise exception 'Invalid Event3 timer start' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid;
  v_phase_duration := case v_state.phase
    when 'round1' then 1800
    when 'ranking1' then 180
    when 'round2' then 1500
    when 'ranking2' then 180
    when 'round3' then 1500
    when 'ranking3' then 180
    when 'break' then 600
    when 'phase2_reveal' then 1200
    when 'phase3_reveal' then 1200
    when 'phase4_reveal' then 1200
    else 0
  end;
  v_duration := coalesce(
    p_duration,
    nullif(v_phase_duration, 0),
    case p_round
      when 0 then 180
      when 1 then 1800
      when 2 then 1500
      when 3 then 600
      when 4 then 1200
      when 5 then 1200
      when 6 then 1200
      when 7 then 1200
    end,
    1200
  );
  update public.event_state
  set global_timer_active = true,
      global_timer_start_time = pg_catalog.clock_timestamp(),
      global_timer_duration = v_duration,
      global_timer_round = p_round
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid;
  return pg_catalog.jsonb_build_object(
    'success', true, 'timer_active', true,
    'timer_duration', v_duration, 'timer_round', p_round
  );
end;
$$;

create or replace function public.stop_event3_timer_v2(
  p_event_id integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  update public.event_state
  set global_timer_active = false,
      global_timer_start_time = null
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid;
  return pg_catalog.jsonb_build_object('success', true, 'timer_active', false);
end;
$$;

create or replace function public.adjust_event3_timer_v2(
  p_event_id integer,
  p_delta_seconds integer,
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
  v_default_duration integer;
  v_duration integer;
begin
  if p_delta_seconds is null or p_delta_seconds = 0
     or p_delta_seconds < -14400 or p_delta_seconds > 14400 then
    raise exception 'Invalid Event3 timer adjustment' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid;
  if coalesce(v_state.global_timer_active, false) is not true
     or v_state.global_timer_start_time is null then
    raise exception 'Event3 timer is not active' using errcode = '55000';
  end if;
  v_default_duration := case v_state.phase
    when 'round1' then 1800
    when 'ranking1' then 180
    when 'round2' then 1500
    when 'ranking2' then 180
    when 'round3' then 1500
    when 'ranking3' then 180
    when 'break' then 600
    when 'phase2_reveal' then 1200
    when 'phase3_reveal' then 1200
    when 'phase4_reveal' then 1200
    else 0
  end;
  v_duration := greatest(
    0, coalesce(v_state.global_timer_duration, v_default_duration) + p_delta_seconds
  );
  if v_duration > 14400 then
    raise exception 'Adjusted Event3 timer cannot exceed four hours' using errcode = '22023';
  end if;
  update public.event_state
  set global_timer_duration = v_duration
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid;
  return pg_catalog.jsonb_build_object(
    'success', true, 'timer_active', true, 'timer_duration', v_duration
  );
end;
$$;

-- Co-host ranking corrections must describe the complete ballot for the
-- ranking phase that is active now. This prevents a delayed admin request from
-- replacing a newer session's ballot or silently dropping people the attendee
-- met in an earlier group.
create or replace function public.replace_event3_admin_ranking_order_v2(
  p_event_id integer,
  p_ranker_number integer,
  p_ranked_numbers integer[],
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
  v_completed_rounds integer;
  v_expected integer[];
  v_auto_saved_numbers integer[] := '{}'::integer[];
begin
  if p_ranker_number is null or p_ranker_number <= 0 or p_ranker_number = 9999
     or p_ranked_numbers is null then
    raise exception 'Invalid Event3 ranking replacement' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  select state.* into v_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid;

  v_completed_rounds := case v_state.phase
    when 'ranking1' then 1
    when 'ranking2' then 2
    when 'ranking3' then 3
    else null
  end;
  if v_completed_rounds is null then
    raise exception 'Rankings can only be corrected during the active ranking phase'
      using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = v_state.match_id
      and roster.event_id = p_event_id
      and roster.participant_number = p_ranker_number
  ) then
    raise exception 'Participant is not enrolled in the active Event3 roster'
      using errcode = '22023';
  end if;

  v_expected := public.event3_expected_ranked_numbers(
    v_state.match_id, p_event_id, p_ranker_number, v_completed_rounds
  );
  if pg_catalog.cardinality(v_expected) = 0
     or pg_catalog.cardinality(p_ranked_numbers) is distinct from pg_catalog.cardinality(v_expected)
     or exists (
       select 1 from pg_catalog.unnest(p_ranked_numbers) supplied(ranked_number)
       where supplied.ranked_number is null
          or supplied.ranked_number = p_ranker_number
          or not (supplied.ranked_number = any(v_expected))
     )
     or (
       select pg_catalog.count(distinct supplied.ranked_number)
       from pg_catalog.unnest(p_ranked_numbers) supplied(ranked_number)
     ) <> pg_catalog.cardinality(v_expected) then
    raise exception 'Ranking must include each participant met so far exactly once'
      using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.array_agg(existing.ranked_number order by existing.rank)
      filter (where existing.auto_saved is true),
    '{}'::integer[]
  ) into v_auto_saved_numbers
  from public.participant_rankings existing
  where existing.match_id = v_state.match_id
    and existing.event_id = p_event_id
    and existing.ranker_number = p_ranker_number;

  delete from public.participant_rankings existing
  where existing.match_id = v_state.match_id
    and existing.event_id = p_event_id
    and existing.ranker_number = p_ranker_number;

  insert into public.participant_rankings(
    match_id, event_id, ranker_number, ranked_number, rank, auto_saved
  )
  select
    v_state.match_id,
    p_event_id,
    p_ranker_number,
    supplied.ranked_number,
    supplied.ordinality::integer,
    supplied.ranked_number = any(v_auto_saved_numbers)
  from pg_catalog.unnest(p_ranked_numbers) with ordinality
    supplied(ranked_number, ordinality);

  return pg_catalog.jsonb_build_object(
    'success', true,
    'participant_number', p_ranker_number,
    'count', pg_catalog.cardinality(p_ranked_numbers),
    'completed_rounds', v_completed_rounds
  );
end;
$$;

create or replace function public.save_event3_ranking_v2(
  p_match_id uuid,
  p_event_id integer,
  p_ranker_number integer,
  p_completed_rounds integer,
  p_ranked_numbers integer[],
  p_revision bigint,
  p_draft_only boolean,
  p_auto_saved boolean,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_match_id is distinct from '00000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'Invalid Event3 ranking match context' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  return public.save_event3_ranking(
    p_match_id,
    p_event_id,
    p_ranker_number,
    p_completed_rounds,
    p_ranked_numbers,
    p_revision,
    p_draft_only,
    p_auto_saved
  );
end;
$$;

-- Clearing a ballot also clears only the draft for the live/test session that
-- authorized the request. The participant-rankings trigger marks drafts as
-- submitted on delete, so draft cleanup deliberately follows ballot cleanup.
create or replace function public.clear_event3_participant_ranking_v2(
  p_event_id integer,
  p_ranker_number integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_key text;
  v_deleted integer := 0;
  v_drafts_deleted integer := 0;
begin
  if p_ranker_number is null or p_ranker_number <= 0 or p_ranker_number = 9999 then
    raise exception 'Invalid Event3 ranking participant' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_ranker_number
  ) then
    raise exception 'Participant is not enrolled in the active Event3 roster'
      using errcode = '22023';
  end if;

  select case
    when state.test_mode_active then coalesce(
      state.test_mode_snapshot ->> 'started_at', 'legacy-test'
    )
    else 'live'
  end into v_session_key
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid;

  delete from public.participant_rankings ranking
  where ranking.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and ranking.event_id = p_event_id
    and ranking.ranker_number = p_ranker_number;
  get diagnostics v_deleted = row_count;

  delete from public.event3_ranking_drafts draft
  where draft.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and draft.event_id = p_event_id
    and draft.ranker_number = p_ranker_number
    and draft.session_key = v_session_key;
  get diagnostics v_drafts_deleted = row_count;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'participant_number', p_ranker_number,
    'deleted', v_deleted,
    'drafts_deleted', v_drafts_deleted
  );
end;
$$;

-- Apply a complete set of organizer-supplied ballots in one transaction for
-- either Event3 edition. Per-ranker writes delegate to the exact-permutation
-- validator above; any invalid ballot rolls the whole bulk operation back.
create or replace function public.replace_event3_admin_rankings_v2(
  p_event_id integer,
  p_ranker_numbers integer[],
  p_rows jsonb,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ranker_count integer := coalesce(pg_catalog.cardinality(p_ranker_numbers), 0);
  v_row_count integer;
  v_ranker integer;
  v_ranked_numbers integer[];
  v_result jsonb;
  v_saved integer := 0;
begin
  if v_ranker_count < 1 or v_ranker_count > 42
     or p_rows is null or pg_catalog.jsonb_typeof(p_rows) is distinct from 'array'
     or exists (
       select 1 from pg_catalog.unnest(p_ranker_numbers) ranker(participant_number)
       where ranker.participant_number is null
          or ranker.participant_number <= 0
          or ranker.participant_number = 9999
     )
     or (
       select pg_catalog.count(distinct ranker.participant_number)
       from pg_catalog.unnest(p_ranker_numbers) ranker(participant_number)
     ) <> v_ranker_count then
    raise exception 'Bulk Event3 rankings require unique valid rankers and a row array'
      using errcode = '22023';
  end if;
  v_row_count := pg_catalog.jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 1764
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(p_rows) supplied(value)
       where pg_catalog.jsonb_typeof(supplied.value) is distinct from 'object'
     ) then
    raise exception 'Bulk Event3 ranking rows must contain ranking objects'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_rows) as ranking_data(
      ranker_number integer, ranked_number integer, rank integer
    )
    where ranking_data.ranker_number is null
       or not (ranking_data.ranker_number = any(p_ranker_numbers))
       or ranking_data.ranked_number is null
       or ranking_data.ranked_number <= 0
       or ranking_data.ranked_number = 9999
       or ranking_data.ranked_number = ranking_data.ranker_number
       or ranking_data.rank is null
       or ranking_data.rank <= 0
  ) or exists (
    select ranking_data.ranker_number, ranking_data.ranked_number
    from pg_catalog.jsonb_to_recordset(p_rows) as ranking_data(
      ranker_number integer, ranked_number integer
    )
    group by ranking_data.ranker_number, ranking_data.ranked_number
    having pg_catalog.count(*) <> 1
  ) or exists (
    select ranking_data.ranker_number
    from pg_catalog.jsonb_to_recordset(p_rows) as ranking_data(
      ranker_number integer, rank integer
    )
    group by ranking_data.ranker_number
    having pg_catalog.min(ranking_data.rank) <> 1
       or pg_catalog.max(ranking_data.rank) <> pg_catalog.count(*)
       or pg_catalog.count(distinct ranking_data.rank) <> pg_catalog.count(*)
  ) then
    raise exception 'Bulk Event3 rankings must be contiguous unique ballot rows'
      using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  foreach v_ranker in array p_ranker_numbers loop
    select coalesce(
      pg_catalog.array_agg(ranking_data.ranked_number order by ranking_data.rank),
      '{}'::integer[]
    ) into v_ranked_numbers
    from pg_catalog.jsonb_to_recordset(p_rows) as ranking_data(
      ranker_number integer, ranked_number integer, rank integer
    )
    where ranking_data.ranker_number = v_ranker;

    v_result := public.replace_event3_admin_ranking_order_v2(
      p_event_id,
      v_ranker,
      v_ranked_numbers,
      p_expected_test_mode,
      p_expected_started_at
    );
    v_saved := v_saved + coalesce((v_result ->> 'count')::integer, 0);
  end loop;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'rankers', v_ranker_count,
    'saved', v_saved
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid bulk Event3 ranking rows' using errcode = '22023';
end;
$$;

create or replace function public.clear_event3_rankings_v2(
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
  v_session_key text;
  v_deleted integer := 0;
  v_drafts_deleted integer := 0;
begin
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );

  select case
    when state.test_mode_active then coalesce(
      state.test_mode_snapshot ->> 'started_at', 'legacy-test'
    )
    else 'live'
  end into v_session_key
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid;

  delete from public.participant_rankings ranking
  where ranking.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and ranking.event_id = p_event_id;
  get diagnostics v_deleted = row_count;

  delete from public.event3_ranking_drafts draft
  where draft.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and draft.event_id = p_event_id
    and draft.session_key = v_session_key;
  get diagnostics v_drafts_deleted = row_count;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'deleted', v_deleted,
    'drafts_deleted', v_drafts_deleted
  );
end;
$$;

create or replace function public.save_event3_participant_note_v2(
  p_event_id integer,
  p_participant_number integer,
  p_about_number integer,
  p_note text,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
begin
  if p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     or p_about_number is null or p_about_number <= 0 or p_about_number = 9999
     or p_participant_number = p_about_number
     or pg_catalog.char_length(coalesce(p_note, '')) > 2000 then
    raise exception 'Invalid Event3 participant note' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if (
    select pg_catalog.count(*)
    from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number in (p_participant_number, p_about_number)
  ) <> 2 then
    raise exception 'Both note participants must be enrolled in the active Event3 roster'
      using errcode = '22023';
  end if;

  delete from public.event3_participant_notes note_row
  where note_row.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and note_row.event_id = p_event_id
    and note_row.participant_number = p_participant_number
    and note_row.about_number = p_about_number
    and note_row.phase is null;

  if v_note <> '' then
    insert into public.event3_participant_notes(
      match_id, event_id, participant_number, about_number, phase, note
    ) values (
      '00000000-0000-0000-0000-000000000003'::uuid,
      p_event_id, p_participant_number, p_about_number, null, v_note
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'participant_number', p_participant_number,
    'about_number', p_about_number,
    'saved', v_note <> ''
  );
end;
$$;

create or replace function public.submit_event3_mood_check_v2(
  p_event_id integer,
  p_participant_number integer,
  p_check_id text,
  p_mood text,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer := 0;
  v_existing_mood text;
begin
  if p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     or nullif(pg_catalog.btrim(p_check_id), '') is null
     or pg_catalog.char_length(p_check_id) > 128
     or p_mood is null or p_mood not in ('happy', 'neutral', 'not_great', 'expired') then
    raise exception 'Invalid Event3 mood response' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_participant_number
  ) then
    raise exception 'Participant is not enrolled in the active Event3 roster'
      using errcode = '22023';
  end if;

  update public.event3_mood_checks mood_check
  set mood = p_mood,
      answered_at = pg_catalog.clock_timestamp()
  where mood_check.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and mood_check.event_id = p_event_id
    and mood_check.participant_number = p_participant_number
    and mood_check.check_id = pg_catalog.btrim(p_check_id)
    and mood_check.mood is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    select mood_check.mood into v_existing_mood
    from public.event3_mood_checks mood_check
    where mood_check.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and mood_check.event_id = p_event_id
      and mood_check.participant_number = p_participant_number
      and mood_check.check_id = pg_catalog.btrim(p_check_id);
    if not found then
      raise exception 'Mood check is outside this Event3 session' using errcode = 'P0002';
    end if;
    if v_existing_mood is distinct from p_mood then
      raise exception 'Mood check was already answered' using errcode = '55000';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'check_id', pg_catalog.btrim(p_check_id),
    'mood', p_mood,
    'saved', v_updated > 0
  );
end;
$$;

create or replace function public.trigger_event3_mood_check_v2(
  p_event_id integer,
  p_check_id text,
  p_recipient_numbers integer[],
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sent integer := 0;
  v_recipient_count integer;
begin
  if nullif(pg_catalog.btrim(p_check_id), '') is null
     or pg_catalog.char_length(p_check_id) > 128
     or p_recipient_numbers is null then
    raise exception 'Invalid Event3 mood check' using errcode = '22023';
  end if;
  v_recipient_count := pg_catalog.cardinality(p_recipient_numbers);
  if v_recipient_count < 1
     or exists (
       select 1 from pg_catalog.unnest(p_recipient_numbers) recipient(participant_number)
       where recipient.participant_number is null
          or recipient.participant_number <= 0
          or recipient.participant_number = 9999
     )
     or (
       select pg_catalog.count(distinct recipient.participant_number)
       from pg_catalog.unnest(p_recipient_numbers) recipient(participant_number)
     ) <> v_recipient_count then
    raise exception 'Mood recipients must be unique valid participants' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if exists (
    select 1 from pg_catalog.unnest(p_recipient_numbers) recipient(participant_number)
    where not exists (
      select 1 from public.event3_participants roster
      where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
        and roster.event_id = p_event_id
        and roster.participant_number = recipient.participant_number
    )
  ) then
    raise exception 'Mood recipients must belong to the active Event3 roster'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.event3_mood_checks mood_check
    where mood_check.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and mood_check.check_id = pg_catalog.btrim(p_check_id)
  ) then
    raise exception 'Mood check id was already used' using errcode = '22023';
  end if;

  insert into public.event3_mood_checks(
    match_id, event_id, check_id, participant_number, mood, triggered_at, answered_at
  )
  select
    '00000000-0000-0000-0000-000000000003'::uuid,
    p_event_id,
    pg_catalog.btrim(p_check_id),
    recipient.participant_number,
    null,
    pg_catalog.clock_timestamp(),
    null
  from pg_catalog.unnest(p_recipient_numbers) recipient(participant_number)
  where not exists (
    select 1 from public.event3_mood_checks pending
    where pending.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and pending.event_id = p_event_id
      and pending.participant_number = recipient.participant_number
      and pending.mood is null
  );
  get diagnostics v_sent = row_count;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'check_id', pg_catalog.btrim(p_check_id),
    'sent_to', v_sent,
    'skipped_pending', v_recipient_count - v_sent
  );
end;
$$;

create or replace function public.clear_event3_mood_checks_v2(
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
  v_deleted integer := 0;
begin
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  delete from public.event3_mood_checks mood_check
  where mood_check.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and mood_check.event_id = p_event_id;
  get diagnostics v_deleted = row_count;
  return pg_catalog.jsonb_build_object('success', true, 'deleted', v_deleted);
end;
$$;

create or replace function public.dismiss_event3_notification_v2(
  p_event_id integer,
  p_participant_number integer,
  p_notif_id text,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     or nullif(pg_catalog.btrim(p_notif_id), '') is null
     or pg_catalog.char_length(p_notif_id) > 128 then
    raise exception 'Invalid Event3 notification dismissal' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_participant_number
  ) then
    raise exception 'Participant is not enrolled in the active Event3 roster'
      using errcode = '22023';
  end if;

  update public.event3_notifications notification
  set seen_at = coalesce(notification.seen_at, pg_catalog.clock_timestamp())
  where notification.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and notification.event_id = p_event_id
    and notification.participant_number = p_participant_number
    and notification.notif_id = pg_catalog.btrim(p_notif_id);
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Notification is outside this Event3 session' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'notif_id', pg_catalog.btrim(p_notif_id),
    'dismissed', true
  );
end;
$$;

create or replace function public.send_event3_notification_v2(
  p_event_id integer,
  p_notif_id text,
  p_recipient_numbers integer[],
  p_title text,
  p_body text,
  p_icon text,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipient_count integer;
begin
  if nullif(pg_catalog.btrim(p_notif_id), '') is null
     or pg_catalog.char_length(p_notif_id) > 128
     or p_recipient_numbers is null
     or nullif(pg_catalog.btrim(p_title), '') is null
     or pg_catalog.char_length(p_title) > 120
     or pg_catalog.char_length(coalesce(p_body, '')) > 1000
     or p_icon is null or p_icon not in ('info', 'heart', 'clock', 'star', 'alert') then
    raise exception 'Invalid Event3 notification' using errcode = '22023';
  end if;
  v_recipient_count := pg_catalog.cardinality(p_recipient_numbers);
  if v_recipient_count < 1
     or exists (
       select 1 from pg_catalog.unnest(p_recipient_numbers) recipient(participant_number)
       where recipient.participant_number is null
          or recipient.participant_number <= 0
          or recipient.participant_number = 9999
     )
     or (
       select pg_catalog.count(distinct recipient.participant_number)
       from pg_catalog.unnest(p_recipient_numbers) recipient(participant_number)
     ) <> v_recipient_count then
    raise exception 'Notification recipients must be unique valid participants'
      using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if exists (
    select 1 from pg_catalog.unnest(p_recipient_numbers) recipient(participant_number)
    where not exists (
      select 1 from public.event3_participants roster
      where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
        and roster.event_id = p_event_id
        and roster.participant_number = recipient.participant_number
    )
  ) then
    raise exception 'Notification recipients must belong to the active Event3 roster'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.event3_notifications notification
    where notification.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and notification.notif_id = pg_catalog.btrim(p_notif_id)
  ) then
    raise exception 'Notification id was already used' using errcode = '22023';
  end if;

  insert into public.event3_notifications(
    match_id, event_id, notif_id, participant_number,
    title, body, icon, created_at, seen_at
  )
  select
    '00000000-0000-0000-0000-000000000003'::uuid,
    p_event_id,
    pg_catalog.btrim(p_notif_id),
    recipient.participant_number,
    pg_catalog.btrim(p_title),
    nullif(pg_catalog.btrim(coalesce(p_body, '')), ''),
    p_icon,
    pg_catalog.clock_timestamp(),
    null
  from pg_catalog.unnest(p_recipient_numbers) recipient(participant_number);

  return pg_catalog.jsonb_build_object(
    'success', true,
    'notif_id', pg_catalog.btrim(p_notif_id),
    'sent_to', v_recipient_count
  );
end;
$$;

create or replace function public.clear_event3_notifications_v2(
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
  v_deleted integer := 0;
begin
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  delete from public.event3_notifications notification
  where notification.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and notification.event_id = p_event_id;
  get diagnostics v_deleted = row_count;
  return pg_catalog.jsonb_build_object('success', true, 'deleted', v_deleted);
end;
$$;

create or replace function public.upsert_event3_welcome_messages_v2(
  p_event_id integer,
  p_rows jsonb,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row_count integer;
  v_saved integer := 0;
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Welcome rows must be a JSON array' using errcode = '22023';
  end if;
  v_row_count := pg_catalog.jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 42 then
    raise exception 'Welcome rows must contain between 1 and 42 participants'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_rows) as welcome(
      participant_number integer,
      welcome_message text,
      generated_by text,
      anchor_used text
    )
    where welcome.participant_number is null
       or welcome.participant_number <= 0
       or welcome.participant_number = 9999
       or nullif(pg_catalog.btrim(welcome.welcome_message), '') is null
       or pg_catalog.char_length(welcome.welcome_message) > 4000
       or coalesce(welcome.generated_by, 'system') not in ('system', 'admin')
       or pg_catalog.char_length(coalesce(welcome.anchor_used, '')) > 2000
  ) or (
    select pg_catalog.count(distinct welcome.participant_number)
    from pg_catalog.jsonb_to_recordset(p_rows) as welcome(participant_number integer)
  ) <> v_row_count then
    raise exception 'Invalid or duplicate Event3 welcome rows' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_rows) as welcome(participant_number integer)
    where not exists (
      select 1 from public.event3_participants roster
      where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
        and roster.event_id = p_event_id
        and roster.participant_number = welcome.participant_number
    )
  ) then
    raise exception 'Welcome participants must belong to the active Event3 roster'
      using errcode = '22023';
  end if;

  insert into public.event3_ai_welcome_messages(
    match_id, event_id, participant_number, welcome_message,
    generated_at, generated_by, anchor_used
  )
  select
    '00000000-0000-0000-0000-000000000003'::uuid,
    p_event_id,
    welcome.participant_number,
    pg_catalog.btrim(welcome.welcome_message),
    pg_catalog.clock_timestamp(),
    coalesce(welcome.generated_by, 'system'),
    nullif(pg_catalog.btrim(coalesce(welcome.anchor_used, '')), '')
  from pg_catalog.jsonb_to_recordset(p_rows) as welcome(
    participant_number integer,
    welcome_message text,
    generated_by text,
    anchor_used text
  )
  on conflict (match_id, event_id, participant_number) do update set
    welcome_message = excluded.welcome_message,
    generated_at = excluded.generated_at,
    generated_by = excluded.generated_by,
    anchor_used = excluded.anchor_used;
  get diagnostics v_saved = row_count;

  return pg_catalog.jsonb_build_object('success', true, 'saved', v_saved);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid Event3 welcome rows' using errcode = '22023';
end;
$$;

create or replace function public.delete_event3_welcome_message_v2(
  p_event_id integer,
  p_participant_number integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999 then
    raise exception 'Invalid Event3 welcome participant' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  if not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_participant_number
  ) then
    raise exception 'Participant is not enrolled in the active Event3 roster'
      using errcode = '22023';
  end if;
  delete from public.event3_ai_welcome_messages welcome
  where welcome.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and welcome.event_id = p_event_id
    and welcome.participant_number = p_participant_number;
  get diagnostics v_deleted = row_count;
  return pg_catalog.jsonb_build_object(
    'success', true,
    'participant_number', p_participant_number,
    'deleted', v_deleted > 0
  );
end;
$$;

create or replace function public.reset_event3_attendance_v2(
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
  v_deleted integer := 0;
begin
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  delete from public.event_attendance attendance
  where attendance.match_id = '00000000-0000-0000-0000-000000000000'::uuid
    and attendance.event_id = p_event_id;
  get diagnostics v_deleted = row_count;
  return pg_catalog.jsonb_build_object('success', true, 'deleted', v_deleted);
end;
$$;

create or replace function public.edit_event3_feedback_v2(
  p_event_id integer,
  p_participant_number integer,
  p_slot text,
  p_expected_partner integer,
  p_feedback jsonb,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_partner integer;
  v_event_format text;
begin
  if p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     or p_slot is null or p_slot not in ('phase2', 'phase3', 'phase4')
     or p_expected_partner is null or p_expected_partner <= 0 or p_expected_partner = 9999
     or p_expected_partner = p_participant_number
     or p_feedback is null or pg_catalog.jsonb_typeof(p_feedback) is distinct from 'object'
     or pg_catalog.octet_length(p_feedback::text) > 32768 then
    raise exception 'Invalid Event3 feedback edit' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = '00000000-0000-0000-0000-000000000003'::uuid
   and settings.event_id = p_event_id;
  if p_slot = 'phase4' and v_event_format <> 'choice_only_three_groups' then
    raise exception 'Phase 4 feedback is only available in a choice-only Event3 edition'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_participant_number
  ) then
    raise exception 'Participant is not enrolled in the active Event3 roster'
      using errcode = '22023';
  end if;

  select case p_slot
    when 'phase2' then match_row.phase2_partner
    when 'phase3' then match_row.phase3_partner
    when 'phase4' then match_row.phase4_partner
  end into v_partner
  from public.event3_matches match_row
  where match_row.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and match_row.event_id = p_event_id
    and match_row.participant_number = p_participant_number;
  if not found or v_partner is null or v_partner <= 0 or v_partner = 9999 then
    raise exception 'Feedback requires a current reciprocal partner for this slot'
      using errcode = '55000';
  end if;
  if v_partner is distinct from p_expected_partner then
    raise exception 'The feedback partner changed before the edit was saved'
      using errcode = '55000';
  end if;
  if not exists (
    select 1
    from public.event3_participants roster
    join public.event3_matches partner_row
      on partner_row.match_id = roster.match_id
     and partner_row.event_id = roster.event_id
     and partner_row.participant_number = roster.participant_number
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = v_partner
      and case p_slot
        when 'phase2' then partner_row.phase2_partner
        when 'phase3' then partner_row.phase3_partner
        when 'phase4' then partner_row.phase4_partner
      end = p_participant_number
  ) then
    raise exception 'Feedback requires a current reciprocal partner for this slot'
      using errcode = '55000';
  end if;

  if p_slot = 'phase2' then
    update public.event3_matches
    set phase2_feedback = p_feedback
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and event_id = p_event_id and participant_number = p_participant_number;
  elsif p_slot = 'phase3' then
    update public.event3_matches
    set phase3_feedback = p_feedback
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and event_id = p_event_id and participant_number = p_participant_number;
  else
    update public.event3_matches
    set phase4_feedback = p_feedback
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and event_id = p_event_id and participant_number = p_participant_number;
  end if;
  return pg_catalog.jsonb_build_object(
    'success', true,
    'participant_number', p_participant_number,
    'partner_number', v_partner,
    'slot', p_slot
  );
end;
$$;

create or replace function public.clear_event3_feedback_v2(
  p_event_id integer,
  p_include_phase4 boolean,
  p_is_test_mode boolean,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_format text;
  v_pair_rows integer := 0;
  v_group_rows integer := 0;
begin
  if p_include_phase4 is null or p_is_test_mode is null
     or p_is_test_mode is distinct from p_expected_test_mode then
    raise exception 'Invalid Event3 feedback clear context' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = '00000000-0000-0000-0000-000000000003'::uuid
   and settings.event_id = p_event_id;
  if p_include_phase4 is distinct from (v_event_format = 'choice_only_three_groups') then
    raise exception 'Feedback slots do not match the active Event3 edition'
      using errcode = '22023';
  end if;

  if p_include_phase4 then
    update public.event3_matches
    set phase2_feedback = null,
        phase3_feedback = null,
        phase4_feedback = null
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and event_id = p_event_id;
  else
    update public.event3_matches
    set phase2_feedback = null,
        phase3_feedback = null
    where match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and event_id = p_event_id;
  end if;
  get diagnostics v_pair_rows = row_count;

  delete from public.event3_group_member_feedback group_feedback
  where group_feedback.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and group_feedback.event_id = p_event_id
    and group_feedback.is_test_mode = p_is_test_mode;
  get diagnostics v_group_rows = row_count;
  return pg_catalog.jsonb_build_object(
    'success', true,
    'pair_rows_cleared', v_pair_rows,
    'group_rows_deleted', v_group_rows,
    'is_test_mode', p_is_test_mode
  );
end;
$$;

create or replace function public.save_event3_cohost_note_v2(
  p_event_id integer,
  p_scope_type text,
  p_scope_key text,
  p_round integer,
  p_table_number integer,
  p_participant_number integer,
  p_participant2_number integer,
  p_note text,
  p_updated_by text,
  p_expected_updated_at timestamptz,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_format text;
  v_session_key text;
  v_note text;
  v_expected_scope_key text;
  v_existing public.event3_cohost_notes%rowtype;
  v_saved public.event3_cohost_notes%rowtype;
  v_exists boolean := false;
  v_deleted integer := 0;
begin
  if p_scope_type is null
     or p_scope_type not in ('event', 'table', 'participant', 'pair')
     or p_scope_key is null
     or p_note is null
     or pg_catalog.char_length(p_note) > 2000
     or p_updated_by is null
     or p_updated_by not in ('admin3', 'event3-cohost')
     or (p_expected_test_mode and nullif(p_expected_started_at, '') is null) then
    raise exception 'Invalid Event3 co-host note' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  v_session_key := case when p_expected_test_mode then p_expected_started_at else '' end;
  v_note := pg_catalog.btrim(p_note);

  select coalesce(settings.event_format, 'classic') into v_event_format
  from (select 1) seed
  left join public.event3_event_settings settings
    on settings.match_id = '00000000-0000-0000-0000-000000000003'::uuid
   and settings.event_id = p_event_id;

  if p_scope_type = 'event' then
    if p_round is not null or p_table_number is not null
       or p_participant_number is not null or p_participant2_number is not null then
      raise exception 'Invalid Event3 event note scope' using errcode = '22023';
    end if;
    v_expected_scope_key := 'event';
  elsif p_scope_type = 'table' then
    if p_round is null or p_table_number is null or p_table_number <= 0
       or p_participant_number is not null or p_participant2_number is not null
       or p_round not in (1, 2, 3, 20, 30, 40)
       or (p_round = 40 and v_event_format <> 'choice_only_three_groups') then
      raise exception 'Invalid Event3 table note scope' using errcode = '22023';
    end if;
    v_expected_scope_key := 'table:' || p_round::text || ':' || p_table_number::text;
    if not exists (
      select 1 from public.session_assignments assignment
      where assignment.match_id = '00000000-0000-0000-0000-000000000003'::uuid
        and assignment.event_id = p_event_id
        and assignment.round = p_round
        and assignment.table_number = p_table_number
    ) then
      raise exception 'The Event3 note table does not exist in the active event'
        using errcode = '22023';
    end if;
  elsif p_scope_type = 'participant' then
    if p_round is not null or p_table_number is not null or p_participant2_number is not null
       or p_participant_number is null or p_participant_number <= 0
       or p_participant_number = 9999 then
      raise exception 'Invalid Event3 participant note scope' using errcode = '22023';
    end if;
    v_expected_scope_key := 'participant:' || p_participant_number::text;
  else
    if p_table_number is not null
       or p_round is null or p_round not in (20, 30, 40)
       or (p_round = 40 and v_event_format <> 'choice_only_three_groups')
       or p_participant_number is null or p_participant_number <= 0
       or p_participant_number = 9999
       or p_participant2_number is null or p_participant2_number <= 0
       or p_participant2_number = 9999
       or p_participant_number >= p_participant2_number then
      raise exception 'Invalid Event3 pair note scope' using errcode = '22023';
    end if;
    v_expected_scope_key := 'pair:' || p_round::text || ':'
      || p_participant_number::text || '-' || p_participant2_number::text;
  end if;

  if p_scope_key is distinct from v_expected_scope_key then
    raise exception 'The Event3 note scope key is not canonical' using errcode = '22023';
  end if;

  if p_participant_number is not null and not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_participant_number
  ) then
    raise exception 'The Event3 note target is not enrolled in the active roster'
      using errcode = '22023';
  end if;
  if p_participant2_number is not null and not exists (
    select 1 from public.event3_participants roster
    where roster.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and roster.event_id = p_event_id
      and roster.participant_number = p_participant2_number
  ) then
    raise exception 'The Event3 note target is not enrolled in the active roster'
      using errcode = '22023';
  end if;
  if p_scope_type = 'pair' and not exists (
    select 1
    from public.event3_matches first_match
    join public.event3_matches second_match
      on second_match.match_id = first_match.match_id
     and second_match.event_id = first_match.event_id
     and second_match.participant_number = p_participant2_number
    where first_match.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and first_match.event_id = p_event_id
      and first_match.participant_number = p_participant_number
      and case p_round
        when 20 then first_match.phase2_partner
        when 30 then first_match.phase3_partner
        when 40 then first_match.phase4_partner
      end = p_participant2_number
      and case p_round
        when 20 then second_match.phase2_partner
        when 30 then second_match.phase3_partner
        when 40 then second_match.phase4_partner
      end = p_participant_number
  ) then
    raise exception 'The Event3 note pair is not a current reciprocal meeting'
      using errcode = '55000';
  end if;
  if p_scope_type = 'pair' and not exists (
    select 1
    from public.session_assignments first_seat
    join public.session_assignments second_seat
      on second_seat.match_id = first_seat.match_id
     and second_seat.event_id = first_seat.event_id
     and second_seat.round = first_seat.round
     and second_seat.table_number = first_seat.table_number
     and second_seat.participant_id = p_participant2_number
    where first_seat.match_id = '00000000-0000-0000-0000-000000000003'::uuid
      and first_seat.event_id = p_event_id
      and first_seat.round = p_round
      and first_seat.participant_id = p_participant_number
  ) then
    raise exception 'The Event3 note pair does not share its current one-to-one table'
      using errcode = '55000';
  end if;

  select note_row.* into v_existing
  from public.event3_cohost_notes note_row
  where note_row.match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and note_row.event_id = p_event_id
    and note_row.test_mode = p_expected_test_mode
    and note_row.test_session_key = v_session_key
    and note_row.scope_key = p_scope_key
  for update;
  v_exists := found;

  if (v_exists and p_expected_updated_at is null)
     or (not v_exists and p_expected_updated_at is not null)
     or (v_exists and v_existing.updated_at is distinct from p_expected_updated_at) then
    raise exception 'The Event3 co-host note changed before it was saved'
      using errcode = '55000';
  end if;

  if v_note = '' then
    if v_exists then
      delete from public.event3_cohost_notes note_row
      where note_row.id = v_existing.id
        and note_row.updated_at = p_expected_updated_at;
      get diagnostics v_deleted = row_count;
      if v_deleted <> 1 then
        raise exception 'The Event3 co-host note changed before it was saved'
          using errcode = '55000';
      end if;
    end if;
    return pg_catalog.jsonb_build_object(
      'success', true,
      'deleted', v_deleted = 1,
      'note', null,
      'scope_key', p_scope_key
    );
  end if;

  if v_exists then
    update public.event3_cohost_notes note_row
    set note = v_note,
        updated_by = p_updated_by,
        updated_at = pg_catalog.clock_timestamp()
    where note_row.id = v_existing.id
      and note_row.updated_at = p_expected_updated_at
    returning note_row.* into v_saved;
    if not found then
      raise exception 'The Event3 co-host note changed before it was saved'
        using errcode = '55000';
    end if;
  else
    insert into public.event3_cohost_notes(
      match_id, event_id, test_mode, test_session_key,
      scope_type, scope_key, round, table_number,
      participant_number, participant2_number,
      note, updated_by, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000003'::uuid,
      p_event_id, p_expected_test_mode, v_session_key,
      p_scope_type, p_scope_key, p_round::smallint, p_table_number,
      p_participant_number, p_participant2_number,
      v_note, p_updated_by, pg_catalog.clock_timestamp()
    ) returning * into v_saved;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'deleted', false,
    'note', pg_catalog.to_jsonb(v_saved),
    'scope_key', p_scope_key
  );
exception
  when unique_violation then
    raise exception 'The Event3 co-host note changed before it was saved'
      using errcode = '55000';
end;
$$;

-- These wrappers deliberately contain no replacement logic. They hold the
-- Event3 live/test session lock, then delegate to the established atomic
-- implementations in the same transaction.
create or replace function public.replace_event3_participant_v2(
  p_event3_match_id uuid,
  p_static_match_id uuid,
  p_event_id integer,
  p_old_participant integer,
  p_new_participant integer,
  p_event_scores jsonb,
  p_match_result_scores jsonb,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_event3_match_id is distinct from '00000000-0000-0000-0000-000000000003'::uuid
     or p_static_match_id is distinct from '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Invalid Event3 replacement match context' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  return public.replace_event3_participant(
    p_event3_match_id, p_static_match_id, p_event_id,
    p_old_participant, p_new_participant,
    p_event_scores, p_match_result_scores
  );
end;
$$;

create or replace function public.swap_event3_match_partner_v2(
  p_match_id uuid,
  p_event_id integer,
  p_phase text,
  p_missing_participant integer,
  p_replacement_participant integer,
  p_expected_missing_partner integer,
  p_expected_replacement_partner integer,
  p_first_score jsonb,
  p_second_score jsonb,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_match_id is distinct from '00000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'Invalid Event3 match context' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  return public.swap_event3_match_partner(
    p_match_id, p_event_id, p_phase,
    p_missing_participant, p_replacement_participant,
    p_expected_missing_partner, p_expected_replacement_partner,
    p_first_score, p_second_score
  );
end;
$$;

create or replace function public.replace_event3_algorithm_match_partner_v2(
  p_event3_match_id uuid,
  p_static_match_id uuid,
  p_event_id integer,
  p_missing_participant integer,
  p_replacement_participant integer,
  p_expected_missing_partner integer,
  p_expected_replacement_partner integer,
  p_first_score jsonb,
  p_second_score jsonb,
  p_sync_locked_matches boolean,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_event3_match_id is distinct from '00000000-0000-0000-0000-000000000003'::uuid
     or p_static_match_id is distinct from '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Invalid Event3 algorithm replacement match context' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );
  return public.replace_event3_algorithm_match_partner(
    p_event3_match_id, p_static_match_id, p_event_id,
    p_missing_participant, p_replacement_participant,
    p_expected_missing_partner, p_expected_replacement_partner,
    p_first_score, p_second_score, p_sync_locked_matches
  );
end;
$$;

revoke all on function public.begin_event3_test_mode(integer, integer[]) from public, anon, authenticated;
revoke all on function public.end_event3_test_mode_core(integer) from public, anon, authenticated;
revoke all on function public.end_event3_test_mode(integer) from public, anon, authenticated;
revoke all on function public.end_event3_test_mode_with_group_feedback(integer) from public, anon, authenticated;
revoke all on function public.clear_event3_test_data(integer) from public, anon, authenticated;
revoke all on function public.assert_event3_auxiliary_session(integer, boolean, text) from public, anon, authenticated;
revoke all on function public.set_event3_attendance_v2(integer, integer, boolean, text, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.append_event3_support_message_v2(text, integer, text, text, integer, text, boolean, text) from public, anon, authenticated;
revoke all on function public.send_event3_support_message_v2(integer, integer, text, text, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.set_event3_support_status_v2(integer, text, text, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.reset_event3_support_requests_v2(integer, boolean, text) from public, anon, authenticated;
revoke all on function public.end_event3_test_mode_v2(integer, text) from public, anon, authenticated;
revoke all on function public.clear_event3_test_data_v2(integer, text) from public, anon, authenticated;
revoke all on function public.toggle_event3_score_reveal_v2(integer, text, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.toggle_event3_phase2_exclusion_v2(integer, integer, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.set_event3_phase_v2(integer, text, boolean, integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.start_event3_timer_v2(integer, integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.stop_event3_timer_v2(integer, boolean, text) from public, anon, authenticated;
revoke all on function public.adjust_event3_timer_v2(integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.replace_event3_admin_ranking_order_v2(integer, integer, integer[], boolean, text) from public, anon, authenticated;
revoke all on function public.save_event3_ranking_v2(uuid, integer, integer, integer, integer[], bigint, boolean, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.replace_event3_admin_rankings_v2(integer, integer[], jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.clear_event3_participant_ranking_v2(integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.clear_event3_rankings_v2(integer, boolean, text) from public, anon, authenticated;
revoke all on function public.save_event3_participant_note_v2(integer, integer, integer, text, boolean, text) from public, anon, authenticated;
revoke all on function public.submit_event3_mood_check_v2(integer, integer, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.trigger_event3_mood_check_v2(integer, text, integer[], boolean, text) from public, anon, authenticated;
revoke all on function public.clear_event3_mood_checks_v2(integer, boolean, text) from public, anon, authenticated;
revoke all on function public.dismiss_event3_notification_v2(integer, integer, text, boolean, text) from public, anon, authenticated;
revoke all on function public.send_event3_notification_v2(integer, text, integer[], text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.clear_event3_notifications_v2(integer, boolean, text) from public, anon, authenticated;
revoke all on function public.upsert_event3_welcome_messages_v2(integer, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.delete_event3_welcome_message_v2(integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public.reset_event3_attendance_v2(integer, boolean, text) from public, anon, authenticated;
revoke all on function public.edit_event3_feedback_v2(integer, integer, text, integer, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.clear_event3_feedback_v2(integer, boolean, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.save_event3_cohost_note_v2(integer, text, text, integer, integer, integer, integer, text, text, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function public.replace_event3_participant_v2(uuid, uuid, integer, integer, integer, jsonb, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.swap_event3_match_partner_v2(uuid, integer, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.replace_event3_algorithm_match_partner_v2(uuid, uuid, integer, integer, integer, integer, integer, jsonb, jsonb, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.begin_event3_test_mode(integer, integer[]) to service_role;
grant execute on function public.end_event3_test_mode_core(integer) to service_role;
grant execute on function public.end_event3_test_mode(integer) to service_role;
grant execute on function public.end_event3_test_mode_with_group_feedback(integer) to service_role;
grant execute on function public.clear_event3_test_data(integer) to service_role;
grant execute on function public.assert_event3_auxiliary_session(integer, boolean, text) to service_role;
grant execute on function public.set_event3_attendance_v2(integer, integer, boolean, text, boolean, boolean, text) to service_role;
grant execute on function public.append_event3_support_message_v2(text, integer, text, text, integer, text, boolean, text) to service_role;
grant execute on function public.send_event3_support_message_v2(integer, integer, text, text, text, text, text, text, boolean, text) to service_role;
grant execute on function public.set_event3_support_status_v2(integer, text, text, boolean, boolean, text) to service_role;
grant execute on function public.reset_event3_support_requests_v2(integer, boolean, text) to service_role;
grant execute on function public.end_event3_test_mode_v2(integer, text) to service_role;
grant execute on function public.clear_event3_test_data_v2(integer, text) to service_role;
grant execute on function public.toggle_event3_score_reveal_v2(integer, text, boolean, boolean, text) to service_role;
grant execute on function public.toggle_event3_phase2_exclusion_v2(integer, integer, boolean, boolean, text) to service_role;
grant execute on function public.set_event3_phase_v2(integer, text, boolean, integer, integer, boolean, text) to service_role;
grant execute on function public.start_event3_timer_v2(integer, integer, integer, boolean, text) to service_role;
grant execute on function public.stop_event3_timer_v2(integer, boolean, text) to service_role;
grant execute on function public.adjust_event3_timer_v2(integer, integer, boolean, text) to service_role;
grant execute on function public.replace_event3_admin_ranking_order_v2(integer, integer, integer[], boolean, text) to service_role;
grant execute on function public.save_event3_ranking_v2(uuid, integer, integer, integer, integer[], bigint, boolean, boolean, boolean, text) to service_role;
grant execute on function public.replace_event3_admin_rankings_v2(integer, integer[], jsonb, boolean, text) to service_role;
grant execute on function public.clear_event3_participant_ranking_v2(integer, integer, boolean, text) to service_role;
grant execute on function public.clear_event3_rankings_v2(integer, boolean, text) to service_role;
grant execute on function public.save_event3_participant_note_v2(integer, integer, integer, text, boolean, text) to service_role;
grant execute on function public.submit_event3_mood_check_v2(integer, integer, text, text, boolean, text) to service_role;
grant execute on function public.trigger_event3_mood_check_v2(integer, text, integer[], boolean, text) to service_role;
grant execute on function public.clear_event3_mood_checks_v2(integer, boolean, text) to service_role;
grant execute on function public.dismiss_event3_notification_v2(integer, integer, text, boolean, text) to service_role;
grant execute on function public.send_event3_notification_v2(integer, text, integer[], text, text, text, boolean, text) to service_role;
grant execute on function public.clear_event3_notifications_v2(integer, boolean, text) to service_role;
grant execute on function public.upsert_event3_welcome_messages_v2(integer, jsonb, boolean, text) to service_role;
grant execute on function public.delete_event3_welcome_message_v2(integer, integer, boolean, text) to service_role;
grant execute on function public.reset_event3_attendance_v2(integer, boolean, text) to service_role;
grant execute on function public.edit_event3_feedback_v2(integer, integer, text, integer, jsonb, boolean, text) to service_role;
grant execute on function public.clear_event3_feedback_v2(integer, boolean, boolean, boolean, text) to service_role;
grant execute on function public.save_event3_cohost_note_v2(integer, text, text, integer, integer, integer, integer, text, text, timestamptz, boolean, text) to service_role;
grant execute on function public.replace_event3_participant_v2(uuid, uuid, integer, integer, integer, jsonb, jsonb, boolean, text) to service_role;
grant execute on function public.swap_event3_match_partner_v2(uuid, integer, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text) to service_role;
grant execute on function public.replace_event3_algorithm_match_partner_v2(uuid, uuid, integer, integer, integer, integer, integer, jsonb, jsonb, boolean, boolean, text) to service_role;
