-- Remember the rollout boundary, so switching to an old edition with no
-- settings row still means classic. No historical edition is rewritten.
create table public.event3_new_event_default (
  singleton boolean primary key default true check (singleton),
  first_event_id integer not null check (first_event_id > 0)
);
alter table public.event3_new_event_default enable row level security;
revoke all on public.event3_new_event_default from public,anon,authenticated;
grant all on public.event3_new_event_default to service_role;
create policy event3_new_event_default_service_only on public.event3_new_event_default
  for all to service_role using (true) with check (true);

insert into public.event3_new_event_default(first_event_id)
select coalesce(max(event_id),0)+1 from (
  select current_event_id event_id from public.event_state
  union all select event_id from public.event3_event_settings
  union all select event_id from public.event3_participants
  union all select event_id from public.session_assignments
  union all select event_id from public.participants
  union all select event_id from public.match_results
  union all select event_id from public.group_matches
) known_events;

create or replace function public.initialize_event3_new_event_format(p_event_id integer,p_requested_format text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_inserted integer;
begin
  if p_requested_format is not null and p_requested_format not in ('classic','choice_only_three_groups','mutual_choice_six_rounds') then
    raise exception 'Unknown event format' using errcode='22023';
  end if;
  if p_event_id is null or p_event_id < (select first_event_id from public.event3_new_event_default where singleton) then return false; end if;
  insert into public.event3_event_settings(match_id,event_id,event_format)
    values('00000000-0000-0000-0000-000000000003',p_event_id,coalesce(p_requested_format,'mutual_choice_six_rounds'))
    on conflict (match_id,event_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted=1;
end $$;

create or replace function public.default_new_event3_format()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.match_id='00000000-0000-0000-0000-000000000003'::uuid and not coalesce(new.test_mode_active,false) then
    perform public.initialize_event3_new_event_format(new.current_event_id);
  end if;
  return new;
end $$;
create trigger event3_default_format_on_new_pointer
  after insert or update of current_event_id on public.event_state
  for each row execute function public.default_new_event3_format();

-- Both admin entry points retain one atomic pointer transition. An explicit
-- format is a creation choice only; revisiting an edition keeps its setting.
create or replace function public.set_current_event_with_event3_sync_v2(p_event_id integer,p_new_event_format text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_event3_state public.event_state%rowtype; v_changed boolean:=false; v_created boolean; v_format text;
begin
  if p_event_id is null or p_event_id<=0 then raise exception 'A positive event id is required' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('current-event-with-event3-sync',0));
  select * into v_event3_state from public.event_state where match_id='00000000-0000-0000-0000-000000000003' for update;
  if not found then raise exception 'Event3 state is not configured'; end if;
  if v_event3_state.test_mode_active then raise exception 'End Event3 test mode before switching events' using errcode='55000'; end if;
  v_created:=public.initialize_event3_new_event_format(p_event_id,p_new_event_format);
  insert into public.event_state(match_id,current_event_id)
    values('00000000-0000-0000-0000-000000000000',p_event_id)
    on conflict(match_id) do update set current_event_id=excluded.current_event_id;
  if v_event3_state.current_event_id is distinct from p_event_id then
    update public.event_state set current_event_id=p_event_id,phase='setup',global_timer_active=false,
      global_timer_start_time=null,global_timer_duration=null,global_timer_round=null,
      phase2_score_revealed=false,phase3_score_revealed=false
      where match_id=v_event3_state.match_id;
    v_changed:=true;
  end if;
  select event_format into v_format from public.event3_event_settings where match_id=v_event3_state.match_id and event_id=p_event_id;
  return pg_catalog.jsonb_build_object('success',true,'event_id',p_event_id,'event3_reset',v_changed,'event_created',v_created,'event_format',coalesce(v_format,'classic'));
end $$;

create or replace function public.set_current_event_with_event3_sync(p_event_id integer)
returns jsonb language sql security invoker set search_path='' as $$
  select public.set_current_event_with_event3_sync_v2(p_event_id,null);
$$;

revoke all on function public.initialize_event3_new_event_format(integer,text),public.default_new_event3_format(),public.set_current_event_with_event3_sync_v2(integer,text),public.set_current_event_with_event3_sync(integer) from public,anon,authenticated;
grant execute on function public.initialize_event3_new_event_format(integer,text),public.default_new_event3_format(),public.set_current_event_with_event3_sync_v2(integer,text),public.set_current_event_with_event3_sync(integer) to service_role;
