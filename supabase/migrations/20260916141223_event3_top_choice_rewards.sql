create table public.event3_choice_awards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null default '00000000-0000-0000-0000-000000000003',
  event_id integer not null,
  participant_number integer not null check (participant_number > 0),
  first_choice_count integer not null check (first_choice_count > 0),
  tied_winners integer not null check (tied_winners > 0),
  discount_percent integer not null default 50 check (discount_percent = 50),
  reward_code text not null unique default ('BM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  is_test_mode boolean not null default false,
  session_key text not null default 'live',
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  redeemed_at timestamptz,
  redeemed_event_id integer,
  check ((is_test_mode and session_key <> 'live') or (not is_test_mode and session_key = 'live')),
  check ((redeemed_at is null and redeemed_event_id is null) or
    (not is_test_mode and redeemed_at is not null and redeemed_event_id > event_id)),
  unique (match_id, event_id, participant_number, is_test_mode, session_key)
);
alter table public.event3_choice_awards enable row level security;
revoke all on public.event3_choice_awards from public, anon, authenticated;
grant select, insert, update, delete on public.event3_choice_awards to service_role;

-- Snapshot the result exactly once when the organizer opens the matching break.
-- Later ranking extensions, reruns, refreshes and backwards phase jumps cannot
-- take an already announced reward away or create a second winner set.
create or replace function public.award_event3_top_choices_on_break()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_test boolean;
  v_session text;
begin
  if new.match_id <> '00000000-0000-0000-0000-000000000003'::uuid
     or new.phase <> 'break' or old.phase is not distinct from new.phase
     or new.current_event_id is null then return new; end if;
  v_test := coalesce(new.test_mode_active, false);
  v_session := case when v_test then coalesce(new.test_mode_snapshot ->> 'started_at', 'legacy-test') else 'live' end;
  if exists (select 1 from public.event3_choice_awards a where a.match_id = new.match_id
    and a.event_id = new.current_event_id and a.is_test_mode = v_test and a.session_key = v_session) then return new; end if;
  -- A manual phase jump with no generated choice matches earns no reward.
  if not exists (select 1 from public.event3_matches m where m.match_id = new.match_id
    and m.event_id = new.current_event_id and m.phase2_partner is not null) then return new; end if;

  with eligible_votes as (
    select r.ranker_number, min(r.ranked_number) as chosen
    from public.participant_rankings r
    join public.event3_participants voter on voter.match_id = r.match_id and voter.event_id = r.event_id and voter.participant_number = r.ranker_number
    join public.event3_participants candidate on candidate.match_id = r.match_id and candidate.event_id = r.event_id and candidate.participant_number = r.ranked_number
    where r.match_id = new.match_id and r.event_id = new.current_event_id
      and r.rank = 1 and r.ranker_number <> r.ranked_number
    group by r.ranker_number
    -- Corrupt ballots with two distinct #1 choices cannot vote twice.
    having count(distinct r.ranked_number) = 1
  ), totals as (
    select chosen, count(*)::integer as votes from eligible_votes group by chosen
  ), winners as (
    select * from totals where votes = (select max(votes) from totals)
  )
  insert into public.event3_choice_awards (match_id,event_id,participant_number,first_choice_count,tied_winners,is_test_mode,session_key)
  select new.match_id,new.current_event_id,chosen,votes,(select count(*)::integer from winners),v_test,v_session from winners
  on conflict (match_id,event_id,participant_number,is_test_mode,session_key) do nothing;
  return new;
end;
$$;
revoke all on function public.award_event3_top_choices_on_break() from public, anon, authenticated;
grant execute on function public.award_event3_top_choices_on_break() to service_role;
create trigger event3_top_choices_on_break after update of phase on public.event_state
for each row execute function public.award_event3_top_choices_on_break();

create or replace function public.acknowledge_event3_choice_award(
  p_award_id uuid, p_participant_number integer, p_event_id integer,
  p_expected_test_mode boolean, p_expected_started_at text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform public.assert_event3_auxiliary_session(p_event_id,p_expected_test_mode,p_expected_started_at);
  update public.event3_choice_awards set seen_at = coalesce(seen_at,now())
  where id = p_award_id and participant_number = p_participant_number and event_id = p_event_id
    and match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and is_test_mode = p_expected_test_mode
    and session_key = case when p_expected_test_mode then coalesce(p_expected_started_at,'legacy-test') else 'live' end;
  return found;
end;
$$;
revoke all on function public.acknowledge_event3_choice_award(uuid,integer,integer,boolean,text) from public, anon, authenticated;
grant execute on function public.acknowledge_event3_choice_award(uuid,integer,integer,boolean,text) to service_role;

create or replace function public.redeem_event3_choice_award(p_award_id uuid,p_event_id integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform public.assert_event3_auxiliary_session(p_event_id,false,null);
  update public.event3_choice_awards set redeemed_at = now(),redeemed_event_id = p_event_id
  where id = p_award_id and match_id = '00000000-0000-0000-0000-000000000003'::uuid
    and not is_test_mode and redeemed_at is null and event_id < p_event_id;
  return found;
end;
$$;
revoke all on function public.redeem_event3_choice_award(uuid,integer) from public, anon, authenticated;
grant execute on function public.redeem_event3_choice_award(uuid,integer) to service_role;
