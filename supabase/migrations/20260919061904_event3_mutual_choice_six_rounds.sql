-- Mutual choice is opt-in per event. Nothing here changes an edition's setting.
alter table public.event3_event_settings drop constraint if exists event3_event_settings_format;
alter table public.event3_event_settings add constraint event3_event_settings_format
  check (event_format in ('classic','choice_only_three_groups','mutual_choice_six_rounds'));

create table public.event3_mutual_runtime (
  event_id integer not null,
  session_key text not null,
  status text not null check (status in ('running','paused','complete')),
  round_number integer not null check (round_number between 1 and 6),
  duration_seconds integer not null check (duration_seconds between 60 and 3600),
  ends_at timestamptz,
  paused_seconds integer,
  revision integer not null default 1,
  roster jsonb not null,
  assignments jsonb not null,
  choices jsonb not null default '{}',
  history jsonb not null default '[]',
  primary key (event_id, session_key)
);
alter table public.event3_mutual_runtime enable row level security;
revoke all on public.event3_mutual_runtime from public, anon, authenticated;
grant all on public.event3_mutual_runtime to service_role;
create policy event3_mutual_service_only on public.event3_mutual_runtime
  for all to service_role using (true) with check (true);

-- Same event-state lock as the existing reset/test controls. Live generations
-- and test start IDs make delayed requests unable to enter a different run.
create or replace function public.event3_mutual_assert(p_event_id integer,p_session_key text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_state public.event_state%rowtype; v_key text;
begin
  select * into v_state from public.event_state
    where match_id='00000000-0000-0000-0000-000000000003'::uuid for update;
  v_key := case when v_state.test_mode_active then coalesce(v_state.test_mode_snapshot->>'started_at','legacy-test')
    else 'live:'||p_event_id::text||':'||coalesce(v_state.event3_runtime_generation,1)::text end;
  if v_state.current_event_id is distinct from p_event_id or p_session_key is distinct from v_key then
    raise exception 'The event session changed. Refresh before continuing.' using errcode='55000';
  end if;
  if not exists(select 1 from public.event3_event_settings where match_id=v_state.match_id and event_id=p_event_id and event_format='mutual_choice_six_rounds') then
    raise exception 'This event does not use mutual choice' using errcode='55000';
  end if;
end $$;

create or replace function public.event3_mutual_snapshot(p_event_id integer,p_session_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_run public.event3_mutual_runtime%rowtype; v_now timestamptz;
begin
  perform public.event3_mutual_assert(p_event_id,p_session_key);
  select * into v_run from public.event3_mutual_runtime where event_id=p_event_id and session_key=p_session_key;
  v_now:=pg_catalog.clock_timestamp();
  if not found then return pg_catalog.jsonb_build_object('status','setup','round_number',0,'server_now',v_now); end if;
  return pg_catalog.to_jsonb(v_run)||pg_catalog.jsonb_build_object('server_now',v_now,'remaining_seconds',
    case when v_run.status='paused' then v_run.paused_seconds when v_run.status='running' then greatest(0,ceil(extract(epoch from v_run.ends_at-v_now))::integer) else 0 end);
end $$;

create or replace function public.event3_mutual_validate(p_roster jsonb,p_assignments jsonb,p_previous jsonb default '[]',p_choices jsonb default '{}')
returns void language plpgsql security invoker set search_path = '' as $$
declare v_seat jsonb; v_partner jsonb; v_old jsonb; v_old_partner jsonb; v_number integer; v_other integer;
begin
  if pg_catalog.jsonb_typeof(p_roster) is distinct from 'array' or pg_catalog.jsonb_typeof(p_assignments) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_roster)<>pg_catalog.jsonb_array_length(p_assignments)
    or (select count(distinct (a->>'participant_number')::integer) from pg_catalog.jsonb_array_elements(p_assignments) a)<>pg_catalog.jsonb_array_length(p_roster) then
    raise exception 'Every participant must have exactly one assignment' using errcode='22023';
  end if;
  for v_seat in select value from pg_catalog.jsonb_array_elements(p_assignments) loop
    v_number:=(v_seat->>'participant_number')::integer;
    if not exists(select 1 from pg_catalog.jsonb_array_elements(p_roster) r where (r->>'participant_number')::integer=v_number)
      or coalesce(v_seat->>'kind','') not in ('group','pair','break') then raise exception 'Invalid participant assignment' using errcode='22023'; end if;
    if v_seat->>'kind'='pair' then
      v_other:=(v_seat->>'partner_number')::integer;
      select a into v_partner from pg_catalog.jsonb_array_elements(p_assignments) a where (a->>'participant_number')::integer=v_other;
      select a into v_old from pg_catalog.jsonb_array_elements(p_previous) a where (a->>'participant_number')::integer=v_number;
      select a into v_old_partner from pg_catalog.jsonb_array_elements(p_previous) a where (a->>'participant_number')::integer=v_other;
      if v_number=v_other or v_other is null or v_partner is null
        or v_partner->>'kind' is distinct from 'pair' or (v_partner->>'partner_number')::integer is distinct from v_number
        or v_partner->>'table_number' is distinct from v_seat->>'table_number'
        or v_old->>'kind' is distinct from 'group' or v_old_partner->>'kind' is distinct from 'group'
        or v_old->>'group_number' is distinct from v_old_partner->>'group_number'
        or (p_choices->>v_number::text)::integer is distinct from v_other
        or (p_choices->>v_other::text)::integer is distinct from v_number then
        raise exception 'A pair requires reciprocal choices from the same previous group' using errcode='22023';
      end if;
    elsif (v_seat->>'partner_number') is not null then raise exception 'Only mutual pairs have a partner' using errcode='22023';
    end if;
    if v_seat->>'kind'='break' then
      if v_seat->>'table_number' is not null then raise exception 'Break assignment has no table' using errcode='22023'; end if;
    elsif coalesce((v_seat->>'table_number')::integer,0)<=0 then raise exception 'A meeting requires a table' using errcode='22023';
    end if;
    if v_seat->>'kind'='group' and (v_seat->>'group_number') is distinct from (v_seat->>'table_number') then
      raise exception 'Group and table must agree' using errcode='22023';
    end if;
  end loop;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_assignments) a where a->>'kind'<>'break' group by a->>'table_number'
    having count(distinct a->>'kind')<>1 or (min(a->>'kind')='pair' and count(*)<>2) or (min(a->>'kind')='group' and count(*) not between 3 and 8)) then
    raise exception 'Tables must contain one pair or a balanced group' using errcode='22023';
  end if;
end $$;

create or replace function public.event3_mutual_start(p_event_id integer,p_session_key text,p_duration_seconds integer,p_roster jsonb,p_assignments jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform public.event3_mutual_assert(p_event_id,p_session_key);
  if exists(select 1 from public.event3_mutual_runtime where event_id=p_event_id and session_key=p_session_key) then
    return public.event3_mutual_snapshot(p_event_id,p_session_key);
  end if;
  if p_duration_seconds is null or p_duration_seconds not between 60 and 3600 or pg_catalog.jsonb_array_length(p_roster) not between 6 and 100 then
    raise exception 'Use 6 to 100 participants and 1 to 60 minutes per session' using errcode='22023';
  end if;
  if (select phase from public.event_state where match_id='00000000-0000-0000-0000-000000000003')<>'setup' then
    raise exception 'Start is only available during setup' using errcode='55000';
  end if;
  if (select count(*) from public.event3_participants where match_id='00000000-0000-0000-0000-000000000003' and event_id=p_event_id)<>pg_catalog.jsonb_array_length(p_roster)
    or exists(select 1 from pg_catalog.jsonb_array_elements(p_roster) r where not exists(select 1 from public.event3_participants ep where ep.match_id='00000000-0000-0000-0000-000000000003' and ep.event_id=p_event_id and ep.participant_number=(r->>'participant_number')::integer)) then
    raise exception 'The participant roster changed before start' using errcode='55000';
  end if;
  perform public.event3_mutual_validate(p_roster,p_assignments);
  insert into public.event3_mutual_runtime(event_id,session_key,status,round_number,duration_seconds,ends_at,roster,assignments)
    values(p_event_id,p_session_key,'running',1,p_duration_seconds,pg_catalog.clock_timestamp()+p_duration_seconds*interval '1 second',p_roster,p_assignments);
  update public.event_state set phase='round1',global_timer_active=false where match_id='00000000-0000-0000-0000-000000000003';
  return public.event3_mutual_snapshot(p_event_id,p_session_key);
end $$;

create or replace function public.event3_mutual_choose(p_event_id integer,p_session_key text,p_participant_number integer,p_round_number integer,p_chosen_number integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_run public.event3_mutual_runtime%rowtype; v_mine jsonb; v_target jsonb;
begin
  perform public.event3_mutual_assert(p_event_id,p_session_key);
  select * into v_run from public.event3_mutual_runtime where event_id=p_event_id and session_key=p_session_key for update;
  if not found or v_run.status<>'running' or v_run.round_number is distinct from p_round_number or v_run.round_number>=6 or pg_catalog.clock_timestamp()>=v_run.ends_at then
    raise exception 'This round is closed for choices. Refresh for your next session.' using errcode='55000';
  end if;
  select a into v_mine from pg_catalog.jsonb_array_elements(v_run.assignments) a where (a->>'participant_number')::integer=p_participant_number;
  select a into v_target from pg_catalog.jsonb_array_elements(v_run.assignments) a where (a->>'participant_number')::integer=p_chosen_number;
  if v_mine->>'kind' is distinct from 'group' or (p_chosen_number is not null and
    (p_chosen_number=p_participant_number or v_target->>'kind' is distinct from 'group' or v_target->>'group_number' is distinct from v_mine->>'group_number')) then
    raise exception 'Choose one person from your current group or skip' using errcode='22023';
  end if;
  update public.event3_mutual_runtime set choices=choices||pg_catalog.jsonb_build_object(p_participant_number::text,p_chosen_number),revision=revision+1 where event_id=p_event_id and session_key=p_session_key;
  return pg_catalog.jsonb_build_object('saved',true);
end $$;

create or replace function public.event3_mutual_commit(p_event_id integer,p_session_key text,p_revision integer,p_assignments jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_run public.event3_mutual_runtime%rowtype; v_history jsonb; v_now timestamptz;
begin
  perform public.event3_mutual_assert(p_event_id,p_session_key);
  select * into v_run from public.event3_mutual_runtime where event_id=p_event_id and session_key=p_session_key for update;
  v_now:=pg_catalog.clock_timestamp();
  if not found or v_run.revision is distinct from p_revision or v_run.status<>'running' or v_run.ends_at>v_now then
    return pg_catalog.jsonb_build_object('stale',true);
  end if;
  select coalesce(pg_catalog.jsonb_agg(a||pg_catalog.jsonb_build_object('round_number',v_run.round_number)),'[]') into v_history from pg_catalog.jsonb_array_elements(v_run.assignments) a;
  if v_run.round_number=6 then
    update public.event3_mutual_runtime set status='complete',ends_at=null,revision=revision+1,history=history||v_history,choices='{}' where event_id=p_event_id and session_key=p_session_key;
    update public.event_state set phase='final_reveal',global_timer_active=false where match_id='00000000-0000-0000-0000-000000000003';
  else
    perform public.event3_mutual_validate(v_run.roster,p_assignments,v_run.assignments,v_run.choices);
    update public.event3_mutual_runtime set round_number=round_number+1,ends_at=v_now+duration_seconds*interval '1 second',revision=revision+1,history=history||v_history,assignments=p_assignments,choices='{}'
      where event_id=p_event_id and session_key=p_session_key;
  end if;
  return public.event3_mutual_snapshot(p_event_id,p_session_key);
end $$;

create or replace function public.event3_mutual_control(p_event_id integer,p_session_key text,p_command text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_run public.event3_mutual_runtime%rowtype; v_now timestamptz;
begin
  perform public.event3_mutual_assert(p_event_id,p_session_key);
  select * into v_run from public.event3_mutual_runtime where event_id=p_event_id and session_key=p_session_key for update;
  v_now:=pg_catalog.clock_timestamp();
  if p_command='reset' then
    delete from public.event3_mutual_runtime where event_id=p_event_id and session_key=p_session_key;
    update public.event_state set phase='setup',global_timer_active=false,
      event3_runtime_generation=case when test_mode_active then event3_runtime_generation else coalesce(event3_runtime_generation,1)+1 end,
      test_mode_snapshot=case when test_mode_active then test_mode_snapshot||pg_catalog.jsonb_build_object('started_at',v_now) else test_mode_snapshot end
      where match_id='00000000-0000-0000-0000-000000000003';
    return pg_catalog.jsonb_build_object('status','setup','round_number',0,'server_now',v_now);
  elsif p_command='pause' and v_run.status='running' then
    update public.event3_mutual_runtime set status='paused',paused_seconds=greatest(0,ceil(extract(epoch from ends_at-v_now))::integer),ends_at=null,revision=revision+1 where event_id=p_event_id and session_key=p_session_key;
  elsif p_command='resume' and v_run.status='paused' then
    update public.event3_mutual_runtime set status='running',ends_at=v_now+paused_seconds*interval '1 second',paused_seconds=null,revision=revision+1 where event_id=p_event_id and session_key=p_session_key;
  elsif p_command not in ('pause','resume') then raise exception 'Invalid control' using errcode='22023';
  end if;
  return public.event3_mutual_snapshot(p_event_id,p_session_key);
end $$;

-- Extend the existing setup-only setter without weakening its checks.
create or replace function public.event3_mutual_roster(p_event_id integer,p_participant_numbers integer[],p_expected_test_mode boolean,p_expected_started_at text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.assert_event3_auxiliary_session(p_event_id,p_expected_test_mode,p_expected_started_at);
  if (select phase from public.event_state where match_id='00000000-0000-0000-0000-000000000003') is distinct from 'setup' then
    raise exception 'Reset the sessions before changing the roster' using errcode='55000';
  end if;
  if coalesce(pg_catalog.cardinality(p_participant_numbers),0) not between 6 and 100
    or (select count(distinct n) from unnest(p_participant_numbers) n)<>pg_catalog.cardinality(p_participant_numbers)
    or exists(select 1 from unnest(p_participant_numbers) n where n<=0 or n=9999 or not exists(select 1 from public.participants p where p.match_id='00000000-0000-0000-0000-000000000000' and p.assigned_number=n)) then
    raise exception 'Select 6 to 100 unique existing participants' using errcode='22023';
  end if;
  delete from public.event3_participants where match_id='00000000-0000-0000-0000-000000000003' and event_id=p_event_id;
  delete from public.session_assignments where match_id='00000000-0000-0000-0000-000000000003' and event_id=p_event_id;
  insert into public.event3_participants(match_id,event_id,participant_number,position)
    select '00000000-0000-0000-0000-000000000003'::uuid,p_event_id,n,(i-1)::integer from unnest(p_participant_numbers) with ordinality as nums(n,i);
end $$;
revoke all on function public.event3_mutual_roster(integer,integer[],boolean,text) from public,anon,authenticated;
grant execute on function public.event3_mutual_roster(integer,integer[],boolean,text) to service_role;

do $migration$
declare definition text;
begin
  select pg_catalog.pg_get_functiondef('public.set_event3_event_format(uuid,integer,text)'::regprocedure) into definition;
  definition:=replace(definition,'''classic'', ''choice_only_three_groups''','''classic'', ''choice_only_three_groups'', ''mutual_choice_six_rounds''');
  execute definition;
  if pg_catalog.to_regprocedure('public.begin_event3_test_mode(integer,integer[])') is not null then
    select pg_catalog.pg_get_functiondef('public.begin_event3_test_mode(integer,integer[])'::regprocedure) into definition;
    definition:=replace(definition,'v_event_format = ''choice_only_three_groups''','v_event_format in (''choice_only_three_groups'',''mutual_choice_six_rounds'')');
    definition:=replace(definition,'v_event_format <> ''choice_only_three_groups''','v_event_format not in (''choice_only_three_groups'',''mutual_choice_six_rounds'')');
    execute definition;
  end if;
end $migration$;

revoke all on function public.event3_mutual_assert(integer,text),public.event3_mutual_snapshot(integer,text),public.event3_mutual_validate(jsonb,jsonb,jsonb,jsonb),public.event3_mutual_start(integer,text,integer,jsonb,jsonb),public.event3_mutual_choose(integer,text,integer,integer,integer),public.event3_mutual_commit(integer,text,integer,jsonb),public.event3_mutual_control(integer,text,text) from public,anon,authenticated;
grant execute on function public.event3_mutual_assert(integer,text),public.event3_mutual_snapshot(integer,text),public.event3_mutual_validate(jsonb,jsonb,jsonb,jsonb),public.event3_mutual_start(integer,text,integer,jsonb,jsonb),public.event3_mutual_choose(integer,text,integer,integer,integer),public.event3_mutual_commit(integer,text,integer,jsonb),public.event3_mutual_control(integer,text,text) to service_role;
