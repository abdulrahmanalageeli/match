-- Table-scoped coordinator elections and synchronized group content for Event3.
-- Browser clients never access these tables directly; the participant API
-- validates secure tokens and invokes the service-role-only function below.

create table if not exists public.event3_group_coordination (
  match_id uuid not null,
  event_id integer not null check (event_id > 0),
  session_key text not null check (char_length(session_key) between 1 and 160),
  round smallint not null check (round between 1 and 3),
  table_number integer not null check (table_number > 0),
  election_version integer not null default 1 check (election_version > 0),
  election_status text not null default 'voting' check (election_status in ('voting', 'elected')),
  election_kind text not null default 'initial' check (election_kind in ('initial', 'revolt')),
  election_started_at timestamptz not null default pg_catalog.clock_timestamp(),
  election_deadline timestamptz not null default (pg_catalog.clock_timestamp() + interval '3 minutes'),
  coordinator_number integer check (coordinator_number is null or coordinator_number > 0),
  previous_coordinator_number integer check (previous_coordinator_number is null or previous_coordinator_number > 0),
  elected_at timestamptz,
  active_content jsonb,
  content_version bigint not null default 0 check (content_version >= 0),
  content_updated_at timestamptz,
  content_updated_by integer check (content_updated_by is null or content_updated_by > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (match_id, event_id, session_key, round, table_number),
  constraint event3_group_coordination_content_object
    check (active_content is null or jsonb_typeof(active_content) = 'object')
);

create table if not exists public.event3_group_coordinator_votes (
  match_id uuid not null,
  event_id integer not null,
  session_key text not null,
  round smallint not null,
  table_number integer not null,
  election_version integer not null check (election_version > 0),
  voter_number integer not null check (voter_number > 0),
  candidate_number integer not null check (candidate_number > 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (match_id, event_id, session_key, round, table_number, election_version, voter_number),
  foreign key (match_id, event_id, session_key, round, table_number)
    references public.event3_group_coordination(match_id, event_id, session_key, round, table_number)
    on delete cascade
);

create index if not exists idx_event3_group_coordinator_votes_tally
  on public.event3_group_coordinator_votes(
    match_id, event_id, session_key, round, table_number, election_version, candidate_number
  );

comment on table public.event3_group_coordination is
  'Private Event3 table coordinator election state and the content currently projected to that table.';
comment on table public.event3_group_coordinator_votes is
  'Private Event3 coordinator ballots; only aggregate progress and the current participant vote leave the API.';

alter table public.event3_group_coordination enable row level security;
alter table public.event3_group_coordinator_votes enable row level security;
revoke all on table public.event3_group_coordination from public, anon, authenticated;
revoke all on table public.event3_group_coordinator_votes from public, anon, authenticated;
grant select, insert, update, delete on table public.event3_group_coordination to service_role;
grant select, insert, update, delete on table public.event3_group_coordinator_votes to service_role;

create or replace function public.manage_event3_group_coordination_v1(
  p_event_id integer,
  p_round smallint,
  p_participant_number integer,
  p_operation text,
  p_candidate_number integer,
  p_content jsonb,
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
  v_has_coord boolean := false;
  v_member_count integer := 0;
  v_votes_cast integer := 0;
  v_my_vote integer;
  v_winner integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_event_id is null or p_event_id <= 0
     or p_round is null or p_round not between 1 and 3
     or p_participant_number is null or p_participant_number <= 0 or p_participant_number = 9999
     or p_operation is null
     or p_operation not in ('status', 'open', 'vote', 'revolt', 'publish', 'clear') then
    raise exception 'Invalid Event3 group coordination request' using errcode = '22023';
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
  v_has_coord := found;

  if not v_has_coord and p_operation in ('open', 'vote') then
    insert into public.event3_group_coordination(
      match_id, event_id, session_key, round, table_number,
      election_version, election_status, election_kind,
      election_started_at, election_deadline, updated_at
    ) values (
      v_match_id, p_event_id, v_session_key, p_round, v_table_number,
      1, 'voting', 'initial', v_now, v_now + interval '3 minutes', v_now
    )
    returning * into v_coord;
    v_has_coord := true;
  end if;

  if not v_has_coord then
    if p_operation = 'status' then
      select count(*)::integer into v_member_count
      from public.session_assignments assignment
      where assignment.match_id = v_match_id
        and assignment.event_id = p_event_id
        and assignment.round = p_round
        and assignment.table_number = v_table_number;
      return pg_catalog.jsonb_build_object(
        'status', 'idle',
        'table_number', v_table_number,
        'member_count', v_member_count,
        'votes_cast', 0,
        'server_now', v_now
      );
    end if;
    raise exception 'Open the coordinator election first' using errcode = '55000';
  end if;

  if p_operation = 'revolt' then
    if v_coord.coordinator_number is null then
      raise exception 'A coordinator must be elected before a re-election' using errcode = '55000';
    end if;
    if v_coord.election_status <> 'voting' then
      update public.event3_group_coordination coordination
      set election_version = coordination.election_version + 1,
          election_status = 'voting',
          election_kind = 'revolt',
          election_started_at = v_now,
          election_deadline = v_now + interval '3 minutes',
          previous_coordinator_number = coordination.coordinator_number,
          elected_at = null,
          updated_at = v_now
      where coordination.match_id = v_match_id
        and coordination.event_id = p_event_id
        and coordination.session_key = v_session_key
        and coordination.round = p_round
        and coordination.table_number = v_table_number
      returning * into v_coord;
    end if;
  end if;

  if p_operation = 'vote' then
    if v_coord.election_status <> 'voting' then
      raise exception 'The coordinator election is already closed' using errcode = '55000';
    end if;
    if v_coord.election_deadline <= v_now then
      null;
    elsif p_candidate_number is null or p_candidate_number <= 0 or p_candidate_number = 9999
       or not exists (
         select 1 from public.session_assignments candidate
         where candidate.match_id = v_match_id
           and candidate.event_id = p_event_id
           and candidate.round = p_round
           and candidate.table_number = v_table_number
           and candidate.participant_id = p_candidate_number
       ) then
      raise exception 'The selected coordinator candidate is not at this table' using errcode = '22023';
    elsif v_coord.election_kind = 'revolt' and p_candidate_number = v_coord.coordinator_number then
      raise exception 'Choose a different coordinator during a re-election' using errcode = '22023';
    else
      insert into public.event3_group_coordinator_votes(
        match_id, event_id, session_key, round, table_number,
        election_version, voter_number, candidate_number, created_at, updated_at
      ) values (
        v_match_id, p_event_id, v_session_key, p_round, v_table_number,
        v_coord.election_version, p_participant_number, p_candidate_number, v_now, v_now
      )
      on conflict (match_id, event_id, session_key, round, table_number, election_version, voter_number)
      do update set candidate_number = excluded.candidate_number, updated_at = excluded.updated_at;
    end if;
  elsif p_operation in ('publish', 'clear') then
    if v_coord.coordinator_number is distinct from p_participant_number then
      raise exception 'Only the elected table coordinator can control the shared screen' using errcode = '55000';
    end if;
    if p_operation = 'publish' and (
      p_content is null
      or jsonb_typeof(p_content) <> 'object'
      or p_content ->> 'kind' not in ('activity', 'question')
      or coalesce(char_length(p_content ->> 'title'), 0) not between 1 and 160
      or coalesce(char_length(p_content ->> 'body'), 0) > 1000
      or coalesce(char_length(p_content ->> 'activity_id'), 0) > 80
      or pg_catalog.octet_length(p_content::text) > 5000
    ) then
      raise exception 'Invalid shared group content' using errcode = '22023';
    end if;
    update public.event3_group_coordination coordination
    set active_content = case when p_operation = 'clear' then null else p_content end,
        content_version = coordination.content_version + 1,
        content_updated_at = v_now,
        content_updated_by = p_participant_number,
        updated_at = v_now
    where coordination.match_id = v_match_id
      and coordination.event_id = p_event_id
      and coordination.session_key = v_session_key
      and coordination.round = p_round
      and coordination.table_number = v_table_number
    returning * into v_coord;
  end if;

  select count(*)::integer into v_member_count
  from public.session_assignments assignment
  where assignment.match_id = v_match_id
    and assignment.event_id = p_event_id
    and assignment.round = p_round
    and assignment.table_number = v_table_number;

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

  if v_coord.election_status = 'voting'
     and (v_coord.election_deadline <= v_now or (v_member_count > 0 and v_votes_cast >= v_member_count)) then
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

    if v_winner is null and v_coord.coordinator_number is not null and exists (
      select 1 from public.session_assignments incumbent
      where incumbent.match_id = v_match_id
        and incumbent.event_id = p_event_id
        and incumbent.round = p_round
        and incumbent.table_number = v_table_number
        and incumbent.participant_id = v_coord.coordinator_number
    ) then
      v_winner := v_coord.coordinator_number;
    end if;
    if v_winner is null then
      select min(member.participant_id) into v_winner
      from public.session_assignments member
      where member.match_id = v_match_id
        and member.event_id = p_event_id
        and member.round = p_round
        and member.table_number = v_table_number;
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
      and coordination.table_number = v_table_number
    returning * into v_coord;
  end if;

  select vote.candidate_number into v_my_vote
  from public.event3_group_coordinator_votes vote
  where vote.match_id = v_match_id
    and vote.event_id = p_event_id
    and vote.session_key = v_session_key
    and vote.round = p_round
    and vote.table_number = v_table_number
    and vote.election_version = v_coord.election_version
    and vote.voter_number = p_participant_number;

  return pg_catalog.jsonb_build_object(
    'status', v_coord.election_status,
    'kind', v_coord.election_kind,
    'table_number', v_table_number,
    'election_version', v_coord.election_version,
    'election_started_at', v_coord.election_started_at,
    'election_deadline', v_coord.election_deadline,
    'coordinator_number', v_coord.coordinator_number,
    'previous_coordinator_number', v_coord.previous_coordinator_number,
    'elected_at', v_coord.elected_at,
    'member_count', v_member_count,
    'votes_cast', v_votes_cast,
    'my_vote', v_my_vote,
    'active_content', v_coord.active_content,
    'content_version', v_coord.content_version,
    'content_updated_at', v_coord.content_updated_at,
    'server_now', v_now
  );
end;
$$;

revoke all on function public.manage_event3_group_coordination_v1(
  integer, smallint, integer, text, integer, jsonb, boolean, text
) from public, anon, authenticated;
grant execute on function public.manage_event3_group_coordination_v1(
  integer, smallint, integer, text, integer, jsonb, boolean, text
) to service_role;
