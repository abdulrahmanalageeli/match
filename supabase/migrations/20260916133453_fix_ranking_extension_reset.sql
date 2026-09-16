-- Clear individual permissions atomically with organizer ranking resets.


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

  delete from public.event3_ranking_extensions where event_id = p_event_id
    and session_key = v_session_key
    and ranker_number = p_ranker_number;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'participant_number', p_ranker_number,
    'deleted', v_deleted,
    'drafts_deleted', v_drafts_deleted
  );
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

  delete from public.event3_ranking_extensions where event_id = p_event_id
    and session_key = v_session_key;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'deleted', v_deleted,
    'drafts_deleted', v_drafts_deleted
  );
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
  delete from public.event3_ranking_extensions where event_id = p_event_id
    and session_key = p_expected_started_at;
  return public.clear_event3_test_data(p_event_id);
end;
$$;

create or replace function public.save_event3_ranking_v2(
  p_match_id uuid, p_event_id integer, p_ranker_number integer, p_completed_rounds integer,
  p_ranked_numbers integer[], p_revision bigint, p_draft_only boolean, p_auto_saved boolean,
  p_expected_test_mode boolean, p_expected_started_at text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_expected integer[];
  v_complete boolean;
begin
  if p_match_id is distinct from '00000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'Invalid Event3 ranking match context' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(p_event_id,p_expected_test_mode,p_expected_started_at);
  -- Restarting this ranking timer opens a new ordinary editing window.
  -- Older grants must not force freshly reset/replayed ballots into 'submitted'.
  delete from public.event3_ranking_extensions e using public.event_state s
    where s.match_id = p_match_id and s.current_event_id = p_event_id
      and s.phase = 'ranking' || p_completed_rounds
      and s.global_timer_active and (s.global_timer_start_time > e.started_at or e.finished_at is not null)
      and clock_timestamp() < s.global_timer_start_time + make_interval(secs => s.global_timer_duration)
      and e.event_id = p_event_id and e.ranker_number = p_ranker_number
      and e.completed_rounds = p_completed_rounds
      and e.session_key = case when p_expected_test_mode then p_expected_started_at else 'live' end;
  if exists (select 1 from public.event3_ranking_extensions where event_id = p_event_id
    and ranker_number = p_ranker_number and completed_rounds = p_completed_rounds
    and session_key = case when p_expected_test_mode then p_expected_started_at else 'live' end) then
    v_expected := public.event3_expected_ranked_numbers(p_match_id,p_event_id,p_ranker_number,p_completed_rounds);
    v_complete := cardinality(v_expected) > 0 and not exists (
      select 1 from unnest(v_expected) n where not exists (
        select 1 from public.participant_rankings r where r.match_id=p_match_id
          and r.event_id=p_event_id and r.ranker_number=p_ranker_number and r.ranked_number=n
      )
    );
    return jsonb_build_object('closed', true, 'complete', v_complete, 'saved', false);
  end if;
  return public.save_event3_ranking(p_match_id,p_event_id,p_ranker_number,p_completed_rounds,
    p_ranked_numbers,p_revision,p_draft_only,p_auto_saved);
end;
$$;

create or replace function public.finalize_event3_rankings_on_phase_exit()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.phase = 'setup' and old.phase is distinct from new.phase
    and new.test_mode_active is not distinct from old.test_mode_active then
    update public.event3_ranking_drafts set submitted = true
      where match_id = old.match_id and event_id = old.current_event_id and not submitted
        and session_key = case when coalesce(old.test_mode_active, false)
          then coalesce(old.test_mode_snapshot ->> 'started_at', 'legacy-test')
          else 'live'
        end;
  end if;
  if old.phase in ('ranking1', 'ranking2', 'ranking3') and new.phase is distinct from old.phase
    and new.phase <> 'setup' and new.current_event_id = old.current_event_id
    -- Going backwards to replay a round must not recreate rankings just reset.
    and (new.phase !~ '^(round|ranking)[123]$'
      or right(new.phase,1)::integer > right(old.phase,1)::integer)
    and new.test_mode_active is not distinct from old.test_mode_active then
    perform public.complete_event3_rankings(old.match_id, old.current_event_id,
      case old.phase when 'ranking1' then 1 when 'ranking2' then 2 else 3 end);
  end if;
  return new;
end;
$$;
