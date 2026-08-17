-- Make recent Event3 and cache lifecycle operations transactional and give
-- delta cache an authoritative record of who the completed cache covered.

create table if not exists public.cache_participant_snapshots (
  match_id uuid not null,
  event_id integer not null check (event_id > 0),
  participant_number integer not null check (participant_number > 0 and participant_number <> 9999),
  cached_at timestamptz not null default pg_catalog.now(),
  primary key (match_id, event_id, participant_number)
);

comment on table public.cache_participant_snapshots is
  'Service-only participant membership snapshot from the most recently completed compatibility-cache session.';

alter table public.cache_participant_snapshots enable row level security;
revoke all on table public.cache_participant_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.cache_participant_snapshots to service_role;

create or replace function public.record_cache_session_with_participants(
  p_match_id uuid,
  p_event_id integer,
  p_participant_numbers integer[],
  p_participants_cached integer,
  p_pairs_cached integer,
  p_duration_ms integer,
  p_ai_calls integer,
  p_cache_hit_rate numeric,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot_count integer := 0;
begin
  if p_match_id is null or p_event_id is null or p_event_id <= 0 then
    raise exception 'A match id and positive event id are required';
  end if;
  if coalesce(pg_catalog.array_length(p_participant_numbers, 1), 0) < 1 then
    raise exception 'At least one cached participant is required';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(p_participant_numbers) participant(participant_number)
    where participant.participant_number is null
       or participant.participant_number <= 0
       or participant.participant_number = 9999
  ) then
    raise exception 'Participant snapshot contains an invalid participant number';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cache-participant-snapshot:' || p_match_id::text || ':' || p_event_id::text, 0)
  );

  perform public.record_cache_session(
    p_event_id,
    p_participants_cached,
    p_pairs_cached,
    p_duration_ms,
    p_ai_calls,
    p_cache_hit_rate,
    p_notes
  );

  delete from public.cache_participant_snapshots
  where match_id = p_match_id and event_id = p_event_id;

  insert into public.cache_participant_snapshots (
    match_id,
    event_id,
    participant_number,
    cached_at
  )
  select
    p_match_id,
    p_event_id,
    participant.participant_number,
    pg_catalog.now()
  from (
    select distinct participant_number
    from pg_catalog.unnest(p_participant_numbers) value(participant_number)
  ) participant;

  get diagnostics v_snapshot_count = row_count;
  return pg_catalog.jsonb_build_object(
    'success', true,
    'snapshot_count', v_snapshot_count
  );
end;
$$;

revoke execute on function public.record_cache_session_with_participants(uuid, integer, integer[], integer, integer, integer, integer, numeric, text)
  from public, anon, authenticated;
grant execute on function public.record_cache_session_with_participants(uuid, integer, integer[], integer, integer, integer, integer, numeric, text)
  to service_role;

create or replace function public.set_current_event_with_event3_sync(
  p_event_id integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event3_state public.event_state%rowtype;
  v_event3_changed boolean := false;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('current-event-with-event3-sync', 0)
  );

  select state.*
    into v_event3_state
  from public.event_state state
  where state.match_id = '00000000-0000-0000-0000-000000000003'::uuid
  for update;

  if not found then
    raise exception 'Event3 state is not configured';
  end if;
  if v_event3_state.test_mode_active is true then
    raise exception 'End Event3 test mode before switching events';
  end if;

  insert into public.event_state (match_id, current_event_id)
  values ('00000000-0000-0000-0000-000000000000'::uuid, p_event_id)
  on conflict (match_id)
  do update set current_event_id = excluded.current_event_id;

  if v_event3_state.current_event_id is distinct from p_event_id then
    update public.event_state
    set current_event_id = p_event_id,
        phase = 'setup',
        global_timer_active = false,
        global_timer_start_time = null,
        global_timer_duration = null,
        global_timer_round = null,
        phase2_score_revealed = false,
        phase3_score_revealed = false
    where match_id = v_event3_state.match_id;
    v_event3_changed := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'event3_reset', v_event3_changed
  );
end;
$$;

revoke execute on function public.set_current_event_with_event3_sync(integer)
  from public, anon, authenticated;
grant execute on function public.set_current_event_with_event3_sync(integer)
  to service_role;

create or replace function public.begin_event3_test_mode_with_group_feedback(
  p_event_id integer,
  p_participant_numbers integer[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_deleted_feedback integer := 0;
begin
  v_result := public.begin_event3_test_mode(p_event_id, p_participant_numbers);

  delete from public.event3_group_member_feedback
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and event_id = p_event_id
    and is_test_mode = true;
  get diagnostics v_deleted_feedback = row_count;

  return v_result || pg_catalog.jsonb_build_object('stale_group_feedback_deleted', v_deleted_feedback);
end;
$$;

create or replace function public.end_event3_test_mode_with_group_feedback(
  p_event_id integer
)
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

revoke execute on function public.begin_event3_test_mode_with_group_feedback(integer, integer[])
  from public, anon, authenticated;
revoke execute on function public.end_event3_test_mode_with_group_feedback(integer)
  from public, anon, authenticated;
grant execute on function public.begin_event3_test_mode_with_group_feedback(integer, integer[])
  to service_role;
grant execute on function public.end_event3_test_mode_with_group_feedback(integer)
  to service_role;

create or replace function public.clear_event3_test_data(
  p_event_id integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'A positive event id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event3-clear-test-data:' || p_event_id::text, 0)
  );

  delete from public.participant_rankings
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  delete from public.event3_group_reflections
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  delete from public.event3_group_member_feedback
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  delete from public.event3_participant_notes
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  delete from public.event3_mood_checks
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  delete from public.event3_notifications
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  delete from public.event3_ai_welcome_messages
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  delete from public.event3_test_match_results
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid and event_id = p_event_id;
  delete from public.organizer_requests
  where event_id = p_event_id;

  update public.event3_matches
  set phase2_feedback = null,
      phase3_feedback = null,
      phase2_word = null,
      phase3_word = null,
      match_preference = null
  where match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and event_id = p_event_id;

  return pg_catalog.jsonb_build_object('success', true, 'event_id', p_event_id);
end;
$$;

revoke execute on function public.clear_event3_test_data(integer)
  from public, anon, authenticated;
grant execute on function public.clear_event3_test_data(integer)
  to service_role;
