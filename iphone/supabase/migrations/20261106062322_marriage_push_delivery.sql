-- Device addresses and queue contents are private. No profile/message text enters APNs.
create table marriage.push_preferences (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table marriage.push_devices (
  installation_id uuid primary key,
  member_id uuid not null references marriage.members(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  token text not null check(length(token) between 32 and 512 and length(token)%2=0 and token ~ '^[0-9a-f]+$'),
  environment text not null check(environment in ('sandbox','production')),
  updated_at timestamptz not null default now(),
  unique(token,environment)
);
create index push_devices_member on marriage.push_devices(member_id);
create index push_devices_session on marriage.push_devices(session_id);
create table marriage.push_outbox (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references marriage.push_devices(installation_id) on delete cascade,
  member_id uuid not null references marriage.members(id) on delete cascade,
  request_id uuid not null references marriage.member_requests(id) on delete cascade,
  kind text not null check(kind in('request','mutual','message')),
  event_key text not null,
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '15 minutes',
  attempts integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  finished_at timestamptz,
  outcome text check(outcome in('sent','expired','revoked','invalid','failed')),
  unique(installation_id,event_key)
);
create index push_outbox_ready on marriage.push_outbox(available_at,created_at) where finished_at is null;
create index push_outbox_member on marriage.push_outbox(member_id);
create index push_outbox_request on marriage.push_outbox(request_id);
alter table marriage.push_preferences enable row level security;
alter table marriage.push_devices enable row level security;
alter table marriage.push_outbox enable row level security;
revoke all on marriage.push_preferences,marriage.push_devices,marriage.push_outbox from public,anon,authenticated,service_role;

create function marriage.push_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 return jsonb_build_object('enabled',coalesce((select enabled from marriage.push_preferences where member_id=me),false));
end $$;
create function marriage.push_enable(enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if $1 is null then raise exception 'تحقق من إعداد الإشعارات.' using errcode='22023'; end if;
 insert into marriage.push_preferences values(me,$1,now()) on conflict(member_id) do update set enabled=excluded.enabled,updated_at=now();
 if not $1 then
  update marriage.push_outbox set finished_at=now(),outcome='revoked' where member_id=me and finished_at is null;
 end if;
 return marriage.push_settings();
end $$;
create function marriage.push_register(device_token text,device_environment text,installation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
begin
 if installation is null or device_token is null or length(device_token) not between 32 and 512 or length(device_token)%2<>0 or device_token !~ '^[0-9a-fA-F]+$' or device_environment not in('sandbox','production') or device_environment is null then
  raise exception 'تعذّر تسجيل هذا الجهاز.' using errcode='22023';
 end if;
 perform 1 from marriage.members where id=me for update;
 if not exists(select 1 from marriage.push_devices where installation_id=installation and member_id=me)
    and (select count(*) from marriage.push_devices where member_id=me)>=5 then
  raise exception 'بلغ حسابك حد الأجهزة المسجلة.' using errcode='22023';
 end if;
 -- Rebinding a known token to this signed-in account prevents delivery to its prior account.
 delete from marriage.push_devices where token=lower(device_token) and environment=device_environment and installation_id<>installation;
 insert into marriage.push_devices values(installation,me,sid,lower(device_token),device_environment,now())
 on conflict(installation_id) do update set member_id=excluded.member_id,session_id=excluded.session_id,token=excluded.token,environment=excluded.environment,updated_at=now();
 return marriage.push_settings();
end $$;
create function marriage.push_unregister(installation uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin delete from marriage.push_devices where installation_id=$1 and member_id=me; return true; end $$;

create function marriage.push_allowed(job marriage.push_outbox) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.push_devices d
 join auth.sessions s on s.id=d.session_id and s.user_id=d.member_id
 join marriage.push_preferences p on p.member_id=d.member_id and p.enabled
 join marriage.member_requests r on r.id=job.request_id
 where d.installation_id=job.installation_id and d.member_id=job.member_id
 and (s.not_after is null or s.not_after>now())
 and job.member_id in(r.requester_id,r.recipient_id)
 and marriage.is_paid(r.requester_id) and marriage.is_paid(r.recipient_id)
 and marriage.compatible(r.requester_id,r.recipient_id)
 and case when job.kind='request' then r.status='pending' and r.recipient_id=job.member_id and r.created_at>now()-interval '7 days'
          else r.status='accepted' end)
$$;
create function marriage.enqueue_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare thread_id uuid; recipients uuid[]; event_kind text; event_id text; r marriage.member_requests;
begin
 if tg_table_name='thread_messages' then
  select * into strict r from marriage.member_requests where id=new.request_id;
  thread_id:=r.id; recipients:=array[case when new.sender_id=r.requester_id then r.recipient_id else r.requester_id end];
  event_kind:='message'; event_id:='message:'||new.id;
 else
  thread_id:=new.id;
  if tg_op='INSERT' and new.status='pending' then
   recipients:=array[new.recipient_id];event_kind:='request';event_id:='request:'||new.id;
  elsif tg_op='UPDATE' and old.status='pending' and new.status='accepted' then
   recipients:=array[new.requester_id,new.recipient_id];event_kind:='mutual';event_id:='mutual:'||new.id;
  else return new; end if;
 end if;
 insert into marriage.push_outbox(installation_id,member_id,request_id,kind,event_key)
 select d.installation_id,d.member_id,thread_id,event_kind,event_id from marriage.push_devices d
 join marriage.push_preferences p on p.member_id=d.member_id and p.enabled
 where d.member_id=any(recipients)
 on conflict(installation_id,event_key) do nothing;
 return new;
end $$;
create trigger push_request_insert after insert on marriage.member_requests for each row execute function marriage.enqueue_push();
create trigger push_request_accept after update of status on marriage.member_requests for each row execute function marriage.enqueue_push();
create trigger push_message_insert after insert on marriage.thread_messages for each row execute function marriage.enqueue_push();

create function marriage.push_claim(delivery_environment text,batch_size integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare results jsonb;
begin
 if batch_size not between 1 and 50 or batch_size is null or delivery_environment not in('sandbox','production') or delivery_environment is null then raise exception 'Invalid batch'; end if;
 delete from marriage.push_outbox where finished_at<now()-interval '7 days';
 update marriage.push_outbox o set finished_at=now(),outcome=case when o.expires_at<=now() then 'expired' else 'revoked' end
 where o.finished_at is null and (o.expires_at<=now() or not marriage.push_allowed(o));
 with selected as (select o.id from marriage.push_outbox o join marriage.push_devices d using(installation_id)
   where o.finished_at is null and o.available_at<=now() and d.environment=delivery_environment
   and (o.lease_until is null or o.lease_until<now()) and o.attempts<5
   order by o.created_at for update of o skip locked limit batch_size),
 claimed as (update marriage.push_outbox o set lease_id=gen_random_uuid(),lease_until=now()+interval '120 seconds',attempts=o.attempts+1
   from selected s where o.id=s.id returning o.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'leaseId',c.lease_id,'requestId',c.request_id,'kind',c.kind,
   'token',d.token,'environment',d.environment,'expiresAt',c.expires_at)),'[]'::jsonb) into results
 from claimed c join marriage.push_devices d using(installation_id);
 return results;
end $$;
create function marriage.push_validate(job_id uuid,lease uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select o.finished_at is null and o.lease_id=$2 and o.lease_until>now() and o.expires_at>now() and marriage.push_allowed(o)
 from marriage.push_outbox o where o.id=$1),false)
$$;
create function marriage.push_finish(job_id uuid,lease uuid,result text,device_token text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare job marriage.push_outbox;
begin
 if result not in('sent','invalid','retry','failed','revoked') or result is null then raise exception 'Invalid delivery result'; end if;
 select * into job from marriage.push_outbox where id=$1 and lease_id=$2 and finished_at is null for update;
 if not found then return false; end if;
 if result='invalid' then
  -- A token may rotate or move accounts while APNs is answering an older send.
  delete from marriage.push_devices where installation_id=job.installation_id and member_id=job.member_id and token=$4;
  update marriage.push_outbox set finished_at=now(),outcome='invalid',lease_id=null,lease_until=null where id=$1;
  return true;
 end if;
 update marriage.push_outbox set
  finished_at=case when result='retry' and attempts<5 then null else now() end,
  outcome=case when result='retry' then case when attempts>=5 then 'failed' else null end else result end,
  available_at=now()+make_interval(secs=>least(900,15*(2^attempts)::integer)),lease_id=null,lease_until=null
 where id=$1;
 return true;
end $$;

create function public.marriage_push_settings() returns jsonb language sql stable security invoker set search_path='' as $$ select marriage.push_settings() $$;
create function public.marriage_push_enable(enabled boolean) returns jsonb language sql security invoker set search_path='' as $$ select marriage.push_enable($1) $$;
create function public.marriage_push_register(device_token text,device_environment text,installation uuid) returns jsonb language sql security invoker set search_path='' as $$ select marriage.push_register($1,$2,$3) $$;
create function public.marriage_push_unregister(installation uuid) returns boolean language sql security invoker set search_path='' as $$ select marriage.push_unregister($1) $$;
create function public.marriage_push_claim(delivery_environment text,batch_size integer default 20) returns jsonb language sql security invoker set search_path='' as $$ select marriage.push_claim($1,$2) $$;
create function public.marriage_push_validate(job_id uuid,lease uuid) returns boolean language sql stable security invoker set search_path='' as $$ select marriage.push_validate($1,$2) $$;
create function public.marriage_push_finish(job_id uuid,lease uuid,result text,device_token text default null) returns boolean language sql security invoker set search_path='' as $$ select marriage.push_finish($1,$2,$3,$4) $$;
revoke all on function marriage.push_settings(),marriage.push_enable(boolean),marriage.push_register(text,text,uuid),marriage.push_unregister(uuid),
 marriage.push_allowed(marriage.push_outbox),marriage.enqueue_push(),marriage.push_claim(text,integer),marriage.push_validate(uuid,uuid),marriage.push_finish(uuid,uuid,text,text),
 public.marriage_push_settings(),public.marriage_push_enable(boolean),public.marriage_push_register(text,text,uuid),public.marriage_push_unregister(uuid),
 public.marriage_push_claim(text,integer),public.marriage_push_validate(uuid,uuid),public.marriage_push_finish(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function marriage.push_settings(),marriage.push_enable(boolean),marriage.push_register(text,text,uuid),marriage.push_unregister(uuid),
 public.marriage_push_settings(),public.marriage_push_enable(boolean),public.marriage_push_register(text,text,uuid),public.marriage_push_unregister(uuid) to authenticated;
grant execute on function marriage.push_claim(text,integer),marriage.push_validate(uuid,uuid),marriage.push_finish(uuid,uuid,text,text),
 public.marriage_push_claim(text,integer),public.marriage_push_validate(uuid,uuid),public.marriage_push_finish(uuid,uuid,text,text) to service_role;
