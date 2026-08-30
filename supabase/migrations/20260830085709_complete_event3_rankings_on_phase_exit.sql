-- Keep the last synced order available even when a phone is asleep at phase exit.
-- No historical ballots are changed by applying this migration.
create table public.event3_ranking_drafts (
  match_id uuid not null,
  event_id integer not null,
  ranker_number integer not null,
  completed_rounds smallint not null check (completed_rounds in (1, 2)),
  session_key text not null,
  ranked_numbers integer[] not null,
  revision bigint not null,
  submitted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (match_id, event_id, ranker_number, completed_rounds, session_key)
);
alter table public.event3_ranking_drafts enable row level security;
revoke all on public.event3_ranking_drafts from public, anon, authenticated;
grant all on public.event3_ranking_drafts to service_role;
create policy event3_ranking_drafts_service_only on public.event3_ranking_drafts
  for all to service_role using (true) with check (true);

create or replace function public.event3_expected_ranked_numbers(
  p_match_id uuid, p_event_id integer, p_ranker_number integer, p_completed_rounds integer
) returns integer[] language sql stable security invoker set search_path = public as $$
  select coalesce(array_agg(target order by first_round, target), '{}'::integer[])
  from (
    select b.participant_id as target, min(a.round) as first_round
    from public.session_assignments a
    join public.session_assignments b
      on b.match_id = a.match_id and b.event_id = a.event_id
      and b.round = a.round and b.table_number = a.table_number
      and b.participant_id <> a.participant_id
    where a.match_id = p_match_id and a.event_id = p_event_id
      and a.participant_id = p_ranker_number and a.round between 1 and p_completed_rounds
    group by b.participant_id
  ) peers;
$$;

create or replace function public.save_event3_ranking(
  p_match_id uuid, p_event_id integer, p_ranker_number integer,
  p_completed_rounds integer, p_ranked_numbers integer[],
  p_revision bigint, p_draft_only boolean default false, p_auto_saved boolean default false
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_state public.event_state%rowtype;
  v_expected integer[];
  v_session text;
  v_draft public.event3_ranking_drafts%rowtype;
  v_complete boolean;
begin
  -- Serialize drafts, submissions, and phase changes on the same event row.
  select * into v_state from public.event_state where match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Event has changed; refresh before saving' using errcode = '22023';
  end if;
  if p_completed_rounds is null or p_completed_rounds not in (1, 2) then
    raise exception 'Invalid ranking round' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event3_participants where match_id = p_match_id
    and event_id = p_event_id and participant_number = p_ranker_number) then
    raise exception 'Participant is not enrolled in this event' using errcode = '22023';
  end if;
  v_expected := public.event3_expected_ranked_numbers(p_match_id, p_event_id, p_ranker_number, p_completed_rounds);
  v_complete := cardinality(v_expected) > 0 and not exists (
    select 1 from unnest(v_expected) n where not exists (
      select 1 from public.participant_rankings r where r.match_id = p_match_id
        and r.event_id = p_event_id and r.ranker_number = p_ranker_number and r.ranked_number = n
    )
  );
  -- The phase-exit trigger has already finalized this round. A late phone must
  -- acknowledge that result, never overwrite the ballot used for matching.
  if v_state.phase is distinct from ('ranking' || p_completed_rounds) then
    return jsonb_build_object('closed', true, 'complete', v_complete, 'saved', false);
  end if;
  if cardinality(v_expected) = 0 or p_ranked_numbers is null
    or cardinality(p_ranked_numbers) <> cardinality(v_expected)
    or exists (select 1 from unnest(p_ranked_numbers) n where n is null or not (n = any(v_expected)))
    or (select count(distinct n) from unnest(p_ranked_numbers) n) <> cardinality(v_expected) then
    raise exception 'Ranking must include each participant you met exactly once' using errcode = '22023';
  end if;
  if p_revision is null or p_revision < 0 then
    raise exception 'Invalid draft revision' using errcode = '22023';
  end if;
  v_session := case when v_state.test_mode_active then
    coalesce(v_state.test_mode_snapshot ->> 'started_at', 'legacy-test') else 'live' end;
  select * into v_draft from public.event3_ranking_drafts where match_id = p_match_id
    and event_id = p_event_id and ranker_number = p_ranker_number
    and completed_rounds = p_completed_rounds and session_key = v_session;
  if found and v_draft.revision > p_revision then
    return jsonb_build_object('stale', true, 'complete', v_draft.submitted and v_complete, 'saved', false);
  end if;
  -- An in-flight draft cannot undo a submission with the same revision.
  if found and v_draft.revision = p_revision and v_draft.submitted and p_draft_only then
    return jsonb_build_object('complete', v_complete, 'saved', false);
  end if;
  insert into public.event3_ranking_drafts
    (match_id, event_id, ranker_number, completed_rounds, session_key, ranked_numbers, revision, submitted)
  values (p_match_id, p_event_id, p_ranker_number, p_completed_rounds, v_session,
    p_ranked_numbers, p_revision, not p_draft_only)
  on conflict (match_id, event_id, ranker_number, completed_rounds, session_key) do update
    set ranked_numbers = excluded.ranked_numbers, revision = excluded.revision,
        submitted = excluded.submitted, updated_at = now();
  if not p_draft_only then
    delete from public.participant_rankings where match_id = p_match_id
      and event_id = p_event_id and ranker_number = p_ranker_number;
    insert into public.participant_rankings (match_id, event_id, ranker_number, ranked_number, rank, auto_saved)
      select p_match_id, p_event_id, p_ranker_number, n, ord::integer, p_auto_saved
      from unnest(p_ranked_numbers) with ordinality as ballot(n, ord);
  end if;
  return jsonb_build_object('saved', true, 'complete', not p_draft_only, 'closed', false);
end;
$$;

create or replace function public.complete_event3_rankings(
  p_match_id uuid, p_event_id integer, p_completed_rounds integer, p_ranker_number integer default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_state public.event_state%rowtype;
  v_session text;
  v_number integer;
  v_expected integer[];
  v_missing integer[];
  v_draft public.event3_ranking_drafts%rowtype;
  v_max_rank integer;
  v_saved integer := 0;
  v_added integer := 0;
begin
  select * into v_state from public.event_state where match_id = p_match_id for update;
  if not found or v_state.current_event_id is distinct from p_event_id then
    raise exception 'Event has changed; rankings were not altered' using errcode = '22023';
  end if;
  if p_completed_rounds is null or p_completed_rounds not in (1, 2) then
    raise exception 'Invalid ranking round' using errcode = '22023';
  end if;
  v_session := case when v_state.test_mode_active then
    coalesce(v_state.test_mode_snapshot ->> 'started_at', 'legacy-test') else 'live' end;
  for v_number in select participant_number from public.event3_participants
    where match_id = p_match_id and event_id = p_event_id
      and (p_ranker_number is null or participant_number = p_ranker_number)
    order by participant_number
  loop
    v_expected := public.event3_expected_ranked_numbers(p_match_id, p_event_id, v_number, p_completed_rounds);
    if cardinality(v_expected) = 0 then
      raise exception 'Participant % has no group seating; rankings were not finalized', v_number using errcode = '22023';
    end if;
    select * into v_draft from public.event3_ranking_drafts where match_id = p_match_id
      and event_id = p_event_id and ranker_number = v_number
      and completed_rounds = p_completed_rounds and session_key = v_session;
    if found and not v_draft.submitted
      and cardinality(v_draft.ranked_numbers) = cardinality(v_expected)
      and v_draft.ranked_numbers @> v_expected and v_draft.ranked_numbers <@ v_expected then
      -- A synced unfinished order is more recent than the first-round ballot.
      delete from public.participant_rankings where match_id = p_match_id
        and event_id = p_event_id and ranker_number = v_number;
      insert into public.participant_rankings (match_id, event_id, ranker_number, ranked_number, rank, auto_saved)
        select p_match_id, p_event_id, v_number, n, ord::integer, true
        from unnest(v_draft.ranked_numbers) with ordinality as ballot(n, ord);
      v_saved := v_saved + 1;
    else
      -- Closed/offline phones may have only a first-round ballot. Append only
      -- missing people; keep all existing choices and their provenance intact.
      select coalesce(array_agg(n order by ord), '{}'::integer[]) into v_missing
        from unnest(v_expected) with ordinality as expected(n, ord)
        where not exists (select 1 from public.participant_rankings r
          where r.match_id = p_match_id and r.event_id = p_event_id
            and r.ranker_number = v_number and r.ranked_number = n);
      if cardinality(v_missing) > 0 then
        select coalesce(max(rank), 0) into v_max_rank from public.participant_rankings
          where match_id = p_match_id and event_id = p_event_id and ranker_number = v_number;
        insert into public.participant_rankings (match_id, event_id, ranker_number, ranked_number, rank, auto_saved)
          select p_match_id, p_event_id, v_number, n, v_max_rank + ord::integer, true
          from unnest(v_missing) with ordinality as missing(n, ord);
        v_added := v_added + cardinality(v_missing);
        v_saved := v_saved + 1;
      end if;
    end if;
    update public.event3_ranking_drafts set submitted = true, updated_at = now()
      where match_id = p_match_id and event_id = p_event_id and ranker_number = v_number
        and completed_rounds = p_completed_rounds and session_key = v_session;
  end loop;
  return jsonb_build_object('saved', v_saved, 'added', v_added, 'completed_rounds', p_completed_rounds);
end;
$$;

create or replace function public.finalize_event3_rankings_on_phase_exit()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.phase = 'setup' and old.phase is distinct from new.phase then
    update public.event3_ranking_drafts set submitted = true
      where match_id = old.match_id and event_id = old.current_event_id and not submitted;
  end if;
  if old.phase in ('ranking1', 'ranking2') and new.phase is distinct from old.phase
    and new.phase <> 'setup' and new.current_event_id = old.current_event_id
    and new.test_mode_active is not distinct from old.test_mode_active then
    perform public.complete_event3_rankings(old.match_id, old.current_event_id,
      case when old.phase = 'ranking1' then 1 else 2 end);
  end if;
  return new;
end;
$$;
create trigger event3_complete_rankings_before_phase_exit
  before update of phase on public.event_state
  for each row execute function public.finalize_event3_rankings_on_phase_exit();

revoke all on function public.event3_expected_ranked_numbers(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.save_event3_ranking(uuid, integer, integer, integer, integer[], bigint, boolean, boolean) from public, anon, authenticated;
revoke all on function public.complete_event3_rankings(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.finalize_event3_rankings_on_phase_exit() from public, anon, authenticated;
grant execute on function public.event3_expected_ranked_numbers(uuid, integer, integer, integer) to service_role;
grant execute on function public.save_event3_ranking(uuid, integer, integer, integer, integer[], bigint, boolean, boolean) to service_role;
grant execute on function public.complete_event3_rankings(uuid, integer, integer, integer) to service_role;
grant execute on function public.finalize_event3_rankings_on_phase_exit() to service_role;

-- Organizer corrections/resets supersede drafts. This also covers existing
-- admin tools without requiring every writer to know about the draft table.
create or replace function public.invalidate_event3_ranking_draft()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_match uuid;
  v_event integer;
  v_ranker integer;
  v_session text;
begin
  if tg_op = 'DELETE' then
    v_match := old.match_id; v_event := old.event_id; v_ranker := old.ranker_number;
  else
    v_match := new.match_id; v_event := new.event_id; v_ranker := new.ranker_number;
  end if;
  select case when test_mode_active then coalesce(test_mode_snapshot ->> 'started_at', 'legacy-test') else 'live' end
    into v_session from public.event_state where match_id = v_match;
  update public.event3_ranking_drafts set submitted = true
    where match_id = v_match and event_id = v_event and ranker_number = v_ranker
      and session_key = v_session and not submitted;
  return null;
end;
$$;
create trigger event3_invalidate_draft_on_ballot_change
  after insert or update or delete on public.participant_rankings
  for each row execute function public.invalidate_event3_ranking_draft();
revoke all on function public.invalidate_event3_ranking_draft() from public, anon, authenticated;
grant execute on function public.invalidate_event3_ranking_draft() to service_role;
