-- Individual deadlines never rewind the shared event phase or delete the saved ballot.
create table public.event3_ranking_extensions (
  event_id integer not null,
  ranker_number integer not null,
  session_key text not null,
  id uuid not null default gen_random_uuid(),
  completed_rounds integer not null check (completed_rounds between 1 and 3),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  ranked_numbers integer[],
  revision bigint not null default 0,
  granted_by text not null,
  primary key (event_id, ranker_number, session_key)
);
alter table public.event3_ranking_extensions enable row level security;
revoke all on public.event3_ranking_extensions from public, anon, authenticated;
grant all on public.event3_ranking_extensions to service_role;
create policy ranking_extensions_service_only on public.event3_ranking_extensions
  for all to service_role using (true) with check (true);

create function public.grant_event3_ranking_extension(
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
    expires_at = greatest(now(), case when event3_ranking_extensions.finished_at is null
      then event3_ranking_extensions.expires_at else now() end) + make_interval(secs => p_seconds),
    finished_at = null, granted_by = excluded.granted_by,
    ranked_numbers = case when event3_ranking_extensions.finished_at is null
      and event3_ranking_extensions.completed_rounds = excluded.completed_rounds
      then event3_ranking_extensions.ranked_numbers else null end,
    revision = 0
  returning * into v_extension;
  return to_jsonb(v_extension) - 'ranked_numbers' - 'session_key';
end;
$$;

-- A null id is a status/expiry check; a supplied id authorizes this exact grant.
create function public.resolve_event3_ranking_extension(
  p_event_id integer, p_ranker_number integer, p_expected_test_mode boolean, p_expected_started_at text,
  p_extension_id uuid default null, p_ranked_numbers integer[] default null,
  p_revision bigint default 0, p_draft_only boolean default true
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_match constant uuid := '00000000-0000-0000-0000-000000000003';
  v_session text := case when p_expected_test_mode then p_expected_started_at else 'live' end;
  v_extension public.event3_ranking_extensions%rowtype;
  v_expected integer[];
  v_expired boolean;
begin
  -- Avoid taking the event lock for participants who have never had extra time.
  if p_extension_id is not null then
    perform public.assert_event3_auxiliary_session(p_event_id, p_expected_test_mode, p_expected_started_at);
  end if;
  if not exists (select 1 from public.event3_ranking_extensions where event_id = p_event_id
    and ranker_number = p_ranker_number and session_key = v_session) then
    return jsonb_build_object('extension', null, 'closed', true, 'complete', true, 'saved', false);
  end if;
  perform public.assert_event3_auxiliary_session(p_event_id, p_expected_test_mode, p_expected_started_at);
  select * into v_extension from public.event3_ranking_extensions where event_id = p_event_id
    and ranker_number = p_ranker_number and session_key = v_session for update;
  if p_extension_id is not null and p_extension_id is distinct from v_extension.id then
    raise exception 'The individual ranking timer changed; refresh before saving' using errcode = '55000';
  end if;
  if v_extension.finished_at is not null then
    return jsonb_build_object('extension', null, 'closed', true, 'complete', true, 'saved', false);
  end if;
  v_expected := public.event3_expected_ranked_numbers(v_match, p_event_id, p_ranker_number, v_extension.completed_rounds);
  v_expired := clock_timestamp() >= v_extension.expires_at;
  if not v_expired and p_extension_id is not null then
    if p_ranked_numbers is null or cardinality(p_ranked_numbers) <> cardinality(v_expected)
      or cardinality(v_expected) = 0
      or exists (select 1 from unnest(p_ranked_numbers) n where n is null or not (n = any(v_expected)))
      or (select count(distinct n) from unnest(p_ranked_numbers) n) <> cardinality(v_expected)
      or p_revision is null or p_revision < 0 then
      raise exception 'Ranking must include each participant you met exactly once' using errcode = '22023';
    end if;
    if p_revision < v_extension.revision then
      return jsonb_build_object('stale', true, 'complete', false, 'saved', false);
    end if;
    v_extension.ranked_numbers := p_ranked_numbers;
    update public.event3_ranking_extensions set ranked_numbers = p_ranked_numbers, revision = p_revision
      where id = v_extension.id;
  end if;
  if v_expired or (p_extension_id is not null and not p_draft_only) then
    -- Expiry uses only the last server-synced draft, never a late request body.
    if v_extension.ranked_numbers is not null
      and cardinality(v_extension.ranked_numbers) = cardinality(v_expected)
      and v_extension.ranked_numbers @> v_expected and v_extension.ranked_numbers <@ v_expected then
      delete from public.participant_rankings where match_id = v_match
        and event_id = p_event_id and ranker_number = p_ranker_number;
      insert into public.participant_rankings(match_id,event_id,ranker_number,ranked_number,rank,auto_saved)
        select v_match,p_event_id,p_ranker_number,n,ord::integer,v_expired
        from unnest(v_extension.ranked_numbers) with ordinality as ballot(n,ord);
    end if;
    update public.event3_ranking_extensions set finished_at = now() where id = v_extension.id;
    return jsonb_build_object('extension', null, 'closed', true, 'complete', true,
      'saved', v_extension.ranked_numbers is not null, 'expired', v_expired);
  end if;
  return jsonb_build_object('extension', to_jsonb(v_extension) - 'session_key' - 'granted_by',
    'saved', p_extension_id is not null, 'complete', false, 'closed', false);
end;
$$;

-- Old tabs cannot bypass an individual deadline through the normal save RPC.
create or replace function public.save_event3_ranking_v2(
  p_match_id uuid, p_event_id integer, p_ranker_number integer, p_completed_rounds integer,
  p_ranked_numbers integer[], p_revision bigint, p_draft_only boolean, p_auto_saved boolean,
  p_expected_test_mode boolean, p_expected_started_at text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_match_id is distinct from '00000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'Invalid Event3 ranking match context' using errcode = '22023';
  end if;
  perform public.assert_event3_auxiliary_session(p_event_id,p_expected_test_mode,p_expected_started_at);
  if exists (select 1 from public.event3_ranking_extensions where event_id = p_event_id
    and ranker_number = p_ranker_number and completed_rounds = p_completed_rounds
    and session_key = case when p_expected_test_mode then p_expected_started_at else 'live' end) then
    return jsonb_build_object('closed', true, 'complete', true, 'saved', false);
  end if;
  return public.save_event3_ranking(p_match_id,p_event_id,p_ranker_number,p_completed_rounds,
    p_ranked_numbers,p_revision,p_draft_only,p_auto_saved);
end;
$$;

create function public.close_event3_ranking_extensions_on_reset()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.match_id is distinct from '00000000-0000-0000-0000-000000000003'::uuid then return new; end if;
  if new.phase = 'setup' or new.current_event_id is distinct from old.current_event_id
    or new.test_mode_active is distinct from old.test_mode_active
    or new.test_mode_snapshot->>'started_at' is distinct from old.test_mode_snapshot->>'started_at' then
    delete from public.event3_ranking_extensions where event_id = old.current_event_id;
  elsif new.phase in ('ranking2','ranking3') and new.phase is distinct from old.phase then
    -- A new cumulative ranking supersedes an earlier round's extension.
    update public.event3_ranking_extensions set finished_at = now()
      where event_id = new.current_event_id and finished_at is null
        and completed_rounds < right(new.phase,1)::integer;
  end if;
  return new;
end;
$$;
create trigger event3_close_individual_rankings_on_reset after update on public.event_state
  for each row execute function public.close_event3_ranking_extensions_on_reset();

revoke all on function public.grant_event3_ranking_extension(integer,integer,integer,text,boolean,text) from public,anon,authenticated;
revoke all on function public.resolve_event3_ranking_extension(integer,integer,boolean,text,uuid,integer[],bigint,boolean) from public,anon,authenticated;
revoke all on function public.close_event3_ranking_extensions_on_reset() from public,anon,authenticated;
revoke all on function public.save_event3_ranking_v2(uuid,integer,integer,integer,integer[],bigint,boolean,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.grant_event3_ranking_extension(integer,integer,integer,text,boolean,text) to service_role;
grant execute on function public.resolve_event3_ranking_extension(integer,integer,boolean,text,uuid,integer[],bigint,boolean) to service_role;
grant execute on function public.close_event3_ranking_extensions_on_reset() to service_role;
grant execute on function public.save_event3_ranking_v2(uuid,integer,integer,integer,integer[],bigint,boolean,boolean,boolean,text) to service_role;
