-- Only newly initialized editions change default. Existing event settings and
-- the historical rollout boundary remain intact; explicit format choices win.
create or replace function public.initialize_event3_new_event_format(p_event_id integer,p_requested_format text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_inserted integer;
begin
  if p_requested_format is not null and p_requested_format not in ('classic','choice_only_three_groups','mutual_choice_six_rounds') then
    raise exception 'Unknown event format' using errcode='22023';
  end if;
  if p_event_id is null or p_event_id < (select first_event_id from public.event3_new_event_default where singleton) then return false; end if;
  insert into public.event3_event_settings(match_id,event_id,event_format)
    values('00000000-0000-0000-0000-000000000003',p_event_id,coalesce(p_requested_format,'classic'))
    on conflict (match_id,event_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted=1;
end $$;

revoke all on function public.initialize_event3_new_event_format(integer,text) from public,anon,authenticated;
grant execute on function public.initialize_event3_new_event_format(integer,text) to service_role;
