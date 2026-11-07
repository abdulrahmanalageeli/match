-- Aggregate fault counters, never exception text, stack traces, URLs, or profile data.
create table marriage.client_fault_totals (
  day date not null, event text not null, platform text not null, release text not null,
  total bigint not null default 0,
  primary key(day,event,platform,release)
);
create table marriage.client_fault_limits (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  window_start timestamptz not null default now(), total integer not null default 0
);
alter table marriage.client_fault_totals enable row level security;
alter table marriage.client_fault_limits enable row level security;
revoke all on marriage.client_fault_totals,marriage.client_fault_limits from public,anon,authenticated,service_role;

create function marriage.record_client_fault(event_code text,app_release text,client_platform text) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); allowance marriage.client_fault_limits;
begin
  if event_code is null or event_code not in('render_error','unhandled_error','unhandled_rejection')
    or client_platform is null or client_platform not in('ios','web')
    or app_release is null or app_release !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then
    raise exception 'Invalid diagnostic category.' using errcode='22023';
  end if;
  insert into marriage.client_fault_limits(member_id) values(me) on conflict do nothing;
  select * into allowance from marriage.client_fault_limits where member_id=me for update;
  if allowance.window_start < now()-interval '1 hour' then
    update marriage.client_fault_limits set window_start=now(),total=0 where member_id=me;
  elsif allowance.total>=10 then return false; end if;
  update marriage.client_fault_limits set total=total+1 where member_id=me;
  insert into marriage.client_fault_totals(day,event,platform,release,total)
    values((now() at time zone 'Asia/Riyadh')::date,event_code,client_platform,app_release,1)
    on conflict(day,event,platform,release) do update set total=marriage.client_fault_totals.total+1;
  delete from marriage.client_fault_totals where day < (now() at time zone 'Asia/Riyadh')::date-29;
  delete from marriage.client_fault_limits where window_start<now()-interval '2 days';
  return true;
end $$;
create function public.marriage_record_client_fault(event_code text,app_release text,client_platform text) returns boolean
language sql security invoker set search_path='' as $$select marriage.record_client_fault($1,$2,$3)$$;

create function marriage.admin_health() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform marriage.require_staff(array['owner']);
  return jsonb_build_object('serverTime',now(),'retentionDays',30,
    'clientEvents',coalesce((select jsonb_agg(jsonb_build_object('day',e.day,'event',e.event,'platform',e.platform,'release',e.release,'total',e.total) order by e.day desc,e.event) from marriage.client_fault_totals e
      where e.day >= (now() at time zone 'Asia/Riyadh')::date-29),'[]'::jsonb),
    'push',jsonb_build_object(
      'queued',(select count(*) from marriage.push_outbox where finished_at is null and expires_at>now()),
      'retrying',(select count(*) from marriage.push_outbox where finished_at is null and attempts>0 and expires_at>now()),
      'sent24h',(select count(*) from marriage.push_outbox where outcome='sent' and finished_at>now()-interval '1 day'),
      'failed24h',(select count(*) from marriage.push_outbox where outcome in('failed','invalid') and finished_at>now()-interval '1 day'),
      'oldestPendingAt',(select min(created_at) from marriage.push_outbox where finished_at is null and expires_at>now())));
end $$;
create function public.marriage_admin_health() returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_health()$$;

create function marriage.operations_cleanup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare removed_faults integer; removed_jobs integer;
begin
  if (select current_setting('role',true)) is distinct from 'service_role' then
    raise exception 'Trusted service required.' using errcode='42501';
  end if;
  delete from marriage.client_fault_totals where day < (now() at time zone 'Asia/Riyadh')::date-29;
  get diagnostics removed_faults=row_count;
  delete from marriage.client_fault_limits where window_start<now()-interval '2 days';
  delete from marriage.push_outbox where coalesce(finished_at,expires_at)<now()-interval '7 days';
  get diagnostics removed_jobs=row_count;
  return jsonb_build_object('faultGroups',removed_faults,'notificationJobs',removed_jobs);
end $$;
create function public.marriage_operations_cleanup() returns jsonb
language sql security invoker set search_path='' as $$select marriage.operations_cleanup()$$;
revoke all on function marriage.record_client_fault(text,text,text),public.marriage_record_client_fault(text,text,text),
  marriage.admin_health(),public.marriage_admin_health(),marriage.operations_cleanup(),public.marriage_operations_cleanup()
  from public,anon,authenticated,service_role;
grant execute on function marriage.record_client_fault(text,text,text),public.marriage_record_client_fault(text,text,text),
  marriage.admin_health(),public.marriage_admin_health() to authenticated;
grant execute on function marriage.operations_cleanup(),public.marriage_operations_cleanup() to service_role;
