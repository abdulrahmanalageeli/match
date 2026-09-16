-- Co-host grants are one minute and cannot accumulate into a long deadline.
create or replace function public.grant_event3_ranking_extension(
  p_event_id integer, p_ranker_number integer, p_seconds integer, p_granted_by text,
  p_expected_test_mode boolean, p_expected_started_at text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_state public.event_state%rowtype;
  v_round integer;
  v_session text;
  v_extension public.event3_ranking_extensions%rowtype;
begin
  perform public.assert_event3_auxiliary_session(p_event_id, p_expected_test_mode, p_expected_started_at);
  select * into v_state from public.event_state where match_id = '00000000-0000-0000-0000-000000000003';
  if p_seconds is null or p_seconds not between 30 and 600 or nullif(p_granted_by, '') is null then
    raise exception 'Choose between 30 seconds and 10 minutes' using errcode = '22023';
  end if;
  if p_granted_by like 'cohost:%' and p_seconds <> 60 then
    raise exception 'Co-host extra time is exactly one minute' using errcode = '22023';
  end if;
  if v_state.phase in ('setup', 'round1') or not exists (
    select 1 from public.event3_participants where event_id = p_event_id
      and match_id = v_state.match_id and participant_number = p_ranker_number
  ) then
    raise exception 'Participant has no completed ranking round' using errcode = '22023';
  end if;
  v_round := case when v_state.phase in ('ranking1','round2') then 1
    when v_state.phase in ('ranking2','round3') then 2
    else case when exists (select 1 from public.session_assignments where match_id = v_state.match_id
      and event_id = p_event_id and round = 3) then 3 else 2 end end;
  if not exists (select 1 from public.participant_rankings where match_id = v_state.match_id
    and event_id = p_event_id and ranker_number = p_ranker_number and auto_saved) then
    raise exception 'Extra time is available for automatically saved rankings' using errcode = '22023';
  end if;
  if cardinality(public.event3_expected_ranked_numbers(v_state.match_id, p_event_id, p_ranker_number, v_round)) = 0 then
    raise exception 'Participant has no group seating' using errcode = '22023';
  end if;
  v_session := case when p_expected_test_mode then p_expected_started_at else 'live' end;
  insert into public.event3_ranking_extensions(event_id, ranker_number, session_key, completed_rounds, expires_at, granted_by)
    values (p_event_id, p_ranker_number, v_session, v_round, now() + make_interval(secs => p_seconds), p_granted_by)
  on conflict (event_id, ranker_number, session_key) do update set
    id = gen_random_uuid(), completed_rounds = excluded.completed_rounds, started_at = now(),
    expires_at = case when p_granted_by like 'cohost:%' then now() + interval '60 seconds'
      else greatest(now(), case when event3_ranking_extensions.finished_at is null
      then event3_ranking_extensions.expires_at else now() end) + make_interval(secs => p_seconds) end,
    finished_at = null, granted_by = excluded.granted_by,
    ranked_numbers = case when event3_ranking_extensions.finished_at is null
      and event3_ranking_extensions.completed_rounds = excluded.completed_rounds
      then event3_ranking_extensions.ranked_numbers else null end,
    revision = 0
  returning * into v_extension;
  return to_jsonb(v_extension) - 'ranked_numbers' - 'session_key';
end;
$$;

