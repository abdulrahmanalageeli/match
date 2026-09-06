-- Secure table-consensus shortcuts for Event3 coordinator elections.
-- The participant API is the only caller; ballots and coordination state remain private.

create or replace function public.quick_resolve_event3_group_coordination_v1(
  p_event_id integer,
  p_round smallint,
  p_participant_number integer,
  p_operation text,
  p_candidate_number integer,
  p_expected_test_mode boolean,
  p_expected_started_at text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match_id constant uuid := '00000000-0000-0000-0000-000000000003'::uuid;
  v_table_number integer;
  v_session_key text;
  v_coord public.event3_group_coordination%rowtype;
  v_votes_cast integer := 0;
  v_winner integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_event_id is null or p_event_id <= 0
     or p_round is null or p_round not between 1 and 3
     or p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     or p_expected_test_mode is null
     or p_operation is null
     or p_operation not in ('finalize', 'direct', 'random') then
    raise exception 'Invalid Event3 group election resolution request' using errcode = '22023';
  end if;

  perform public.assert_event3_auxiliary_session(
    p_event_id, p_expected_test_mode, p_expected_started_at
  );

  select assignment.table_number into v_table_number
  from public.session_assignments assignment
  where assignment.match_id = v_match_id
    and assignment.event_id = p_event_id
    and assignment.round = p_round
    and assignment.participant_id = p_participant_number;

  if not found then
    raise exception 'Participant is not assigned to this Event3 group round' using errcode = '55000';
  end if;

  v_session_key := case
    when p_expected_test_mode then 'test:' || coalesce(p_expected_started_at, '')
    else 'live'
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'event3-group-coordination:' || p_event_id::text || ':' || v_session_key || ':' || p_round::text || ':' || v_table_number::text,
      0
    )
  );

  select coordination.* into v_coord
  from public.event3_group_coordination coordination
  where coordination.match_id = v_match_id
    and coordination.event_id = p_event_id
    and coordination.session_key = v_session_key
    and coordination.round = p_round
    and coordination.table_number = v_table_number
  for update;

  if not found then
    raise exception 'Open the coordinator election first' using errcode = '55000';
  end if;
  if v_coord.election_status <> 'voting' then
    raise exception 'The coordinator election is already closed' using errcode = '55000';
  end if;

  if p_operation = 'finalize' then
    select count(*)::integer into v_votes_cast
    from public.event3_group_coordinator_votes vote
    join public.session_assignments voter
      on voter.match_id = vote.match_id
     and voter.event_id = vote.event_id
     and voter.round = vote.round
     and voter.table_number = vote.table_number
     and voter.participant_id = vote.voter_number
    where vote.match_id = v_match_id
      and vote.event_id = p_event_id
      and vote.session_key = v_session_key
      and vote.round = p_round
      and vote.table_number = v_table_number
      and vote.election_version = v_coord.election_version;

    if v_votes_cast = 0 then
      raise exception 'Cast at least one vote before skipping the timer' using errcode = '55000';
    end if;

    select vote.candidate_number into v_winner
    from public.event3_group_coordinator_votes vote
    join public.session_assignments candidate
      on candidate.match_id = vote.match_id
     and candidate.event_id = vote.event_id
     and candidate.round = vote.round
     and candidate.table_number = vote.table_number
     and candidate.participant_id = vote.candidate_number
    where vote.match_id = v_match_id
      and vote.event_id = p_event_id
      and vote.session_key = v_session_key
      and vote.round = p_round
      and vote.table_number = v_table_number
      and vote.election_version = v_coord.election_version
    group by vote.candidate_number
    order by count(*) desc, min(vote.created_at), vote.candidate_number
    limit 1;
  elsif p_operation = 'direct' then
    if p_candidate_number is null or p_candidate_number <= 0 or p_candidate_number = 9999
       or not exists (
         select 1 from public.session_assignments candidate
         where candidate.match_id = v_match_id
           and candidate.event_id = p_event_id
           and candidate.round = p_round
           and candidate.table_number = v_table_number
           and candidate.participant_id = p_candidate_number
       ) then
      raise exception 'The selected coordinator candidate is not at this table' using errcode = '22023';
    end if;
    if v_coord.election_kind = 'revolt' and p_candidate_number = v_coord.coordinator_number then
      raise exception 'Choose a different coordinator during a re-election' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.event3_group_coordinator_votes vote
      where vote.match_id = v_match_id
        and vote.event_id = p_event_id
        and vote.session_key = v_session_key
        and vote.round = p_round
        and vote.table_number = v_table_number
        and vote.election_version = v_coord.election_version
        and vote.voter_number = p_participant_number
        and vote.candidate_number = p_candidate_number
    ) then
      raise exception 'Vote for the candidate before selecting them directly' using errcode = '55000';
    end if;
    v_winner := p_candidate_number;
  else
    select member.participant_id into v_winner
    from public.session_assignments member
    where member.match_id = v_match_id
      and member.event_id = p_event_id
      and member.round = p_round
      and member.table_number = v_table_number
      and (
        v_coord.election_kind <> 'revolt'
        or member.participant_id <> v_coord.coordinator_number
      )
    order by pg_catalog.random()
    limit 1;
  end if;

  if v_winner is null then
    raise exception 'No eligible coordinator is available at this table' using errcode = '55000';
  end if;

  update public.event3_group_coordination coordination
  set coordinator_number = v_winner,
      election_status = 'elected',
      elected_at = v_now,
      updated_at = v_now
  where coordination.match_id = v_match_id
    and coordination.event_id = p_event_id
    and coordination.session_key = v_session_key
    and coordination.round = p_round
    and coordination.table_number = v_table_number;

  return public.manage_event3_group_coordination_v1(
    p_event_id,
    p_round,
    p_participant_number,
    'status',
    null,
    null,
    p_expected_test_mode,
    p_expected_started_at
  );
end;
$$;

comment on function public.quick_resolve_event3_group_coordination_v1(
  integer, smallint, integer, text, integer, boolean, text
) is 'Atomically finishes, directly resolves, or randomly resolves an active Event3 table coordinator election.';

revoke all on function public.quick_resolve_event3_group_coordination_v1(
  integer, smallint, integer, text, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.quick_resolve_event3_group_coordination_v1(
  integer, smallint, integer, text, integer, boolean, text
) to service_role;
