-- Device-scoped native calling credentials. No access to profiles or chat history.
create table marriage.native_call_devices (
 installation_id uuid primary key,
 credential_hash bytea not null,
 member_id uuid references marriage.members on delete cascade,
 session_id uuid references auth.sessions on delete cascade,
 actor text check(actor in('abdulrahman','reham')),
 test_session_hash bytea references nisfayn_test.sessions(token_hash) on delete cascade,
 voip_token text check(voip_token is null or (voip_token ~ '^[0-9a-f]+$' and length(voip_token) between 32 and 512)),
 environment text not null check(environment in('sandbox','production')),
 expires_at timestamptz not null,
 check((member_id is not null and session_id is not null and actor is null and test_session_hash is null)
    or (member_id is null and session_id is null and actor is not null and test_session_hash is not null))
);
create index native_calls_member on marriage.native_call_devices(member_id);
create index native_calls_session on marriage.native_call_devices(session_id);
create index native_calls_test_session on marriage.native_call_devices(test_session_hash);
alter table marriage.native_call_devices enable row level security;
revoke all on marriage.native_call_devices from public,anon,authenticated,service_role;

create function marriage.native_call_register(installation uuid,device_environment text,device_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); sid uuid:=(auth.jwt()->>'session_id')::uuid;
 secret text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 if installation is null or device_environment is null or device_environment not in('sandbox','production')
 or (device_token is not null and ((device_token !~ '^[0-9a-f]+$' or length(device_token) not between 32 and 512) or length(device_token)%2<>0)) then raise exception 'Invalid native device';end if;
 perform 1 from marriage.members where id=me for update;
 delete from marriage.native_call_devices where expires_at<=now();
 if not exists(select 1 from marriage.native_call_devices where installation_id=installation and member_id=me)
 and (select count(*) from marriage.native_call_devices where member_id=me)>=5 then raise exception 'Device limit';end if;
 insert into marriage.native_call_devices values(installation,sha256(secret::bytea),me,sid,null,null,device_token,device_environment,now()+interval '7 days')
 on conflict(installation_id) do update set credential_hash=excluded.credential_hash,member_id=excluded.member_id,session_id=excluded.session_id,
 actor=null,test_session_hash=null,voip_token=excluded.voip_token,environment=excluded.environment,expires_at=excluded.expires_at;
 return jsonb_build_object('credential',secret,'installation',installation);
end $$;
create function public.marriage_native_call_register(installation uuid,device_environment text,device_token text default null) returns jsonb
language sql security invoker set search_path='' as $$select marriage.native_call_register($1,$2,$3)$$;

create function public.nisfayn_test_native_register(session_token text,installation uuid,device_environment text,device_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s nisfayn_test.sessions;
begin
 select * into s from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if not found or not exists(select 1 from marriage.admin_test_members where actor=s.actor and not suspended and not paused and review_status='approved' and access_until>now()) then raise exception 'Session expired' using errcode='42501';end if;
 if installation is null or device_environment is null or device_environment not in('sandbox','production')
 or (device_token is not null and ((device_token !~ '^[0-9a-f]+$' or length(device_token) not between 32 and 512) or length(device_token)%2<>0)) then raise exception 'Invalid native device';end if;
 perform 1 from marriage.admin_test_members where actor=s.actor for update;
 delete from marriage.native_call_devices where expires_at<=now();
 if not exists(select 1 from marriage.native_call_devices where installation_id=installation and actor=s.actor)
 and (select count(*) from marriage.native_call_devices where actor=s.actor)>=5 then raise exception 'Device limit';end if;
 insert into marriage.native_call_devices values(installation,sha256(session_token::bytea),null,null,s.actor,s.token_hash,device_token,device_environment,s.expires_at)
 on conflict(installation_id) do update set credential_hash=excluded.credential_hash,member_id=null,session_id=null,
 actor=excluded.actor,test_session_hash=excluded.test_session_hash,voip_token=excluded.voip_token,environment=excluded.environment,expires_at=excluded.expires_at;
 return jsonb_build_object('credential',session_token,'installation',installation);
end $$;

create function marriage.native_device_allowed(d marriage.native_call_devices) returns boolean language sql stable set search_path='' as $$
 select d.expires_at>now() and case when d.member_id is not null then
 exists(select 1 from auth.sessions s where s.id=d.session_id and s.user_id=d.member_id and (s.not_after is null or s.not_after>now()))
 else exists(select 1 from nisfayn_test.sessions s join marriage.admin_test_members m using(actor)
 where s.token_hash=d.test_session_hash and s.actor=d.actor and s.expires_at>now() and not m.suspended and not m.paused and m.review_status='approved' and m.access_until>now()) end
$$;

create function public.nisfayn_native_call(installation uuid,credential text,command text,call_id uuid default null,device_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d marriage.native_call_devices; result jsonb; state jsonb; prior text:=current_setting('request.jwt.claims',true);
begin
 select * into d from marriage.native_call_devices where installation_id=installation and credential_hash=sha256(credential::bytea);
 if not found or not marriage.native_device_allowed(d) then raise exception 'Session expired' using errcode='42501';end if;
 if command='unregister' then delete from marriage.native_call_devices where installation_id=installation;return '{}'::jsonb;end if;
 if command='device' then
  if device_token is not null and ((device_token !~ '^[0-9a-f]+$' or length(device_token) not between 32 and 512) or length(device_token)%2<>0) then raise exception 'Invalid token';end if;
  update marriage.native_call_devices set voip_token=device_token where installation_id=installation;return '{}'::jsonb;
 end if;
 if command is null or command not in('state','token','accept','decline','end') or call_id is null then raise exception 'Invalid command';end if;
 if d.actor is not null then
  result:=public.nisfayn_test_rpc(case command when 'state' then 'state' when 'token' then 'token' else 'call_'||command end,credential,jsonb_build_object('callId',call_id));
  if command='token' then return result;end if;
  state:=result->'call';
  if state is null or state='null'::jsonb or state->>'id'<>call_id::text then return null;end if;
  return state||jsonb_build_object('direction',case when state->>'caller'=d.actor then 'outgoing' else 'incoming' end);
 end if;
 -- The gateway is service-only. Derive claims exclusively from the registered
 -- device and live auth session; never accept caller-supplied identity claims.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',d.member_id,'session_id',d.session_id,'role','authenticated')::text,true);
 result:=case command when 'state' then marriage.call_state(call_id)
 when 'token' then marriage.call_token_grant(call_id) else marriage.call_act(call_id,command) end;
 perform set_config('request.jwt.claims',coalesce(prior,''),true);
 return result-'person';
end $$;

-- Immediate delivery is authenticated by the API before invoking this service-only
-- function. Call eligibility and recipient sessions are rechecked here as well.
create table marriage.native_call_dispatch(call_id uuid,installation_id uuid references marriage.native_call_devices on delete cascade,created_at timestamptz not null default now(),primary key(call_id,installation_id));
create index native_call_dispatch_device on marriage.native_call_dispatch(installation_id);
alter table marriage.native_call_dispatch enable row level security;
revoke all on marriage.native_call_dispatch from public,anon,authenticated,service_role;
create function public.nisfayn_native_call_targets(call_id uuid,caller_id uuid default null,test_session text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare peer uuid; actor_name text; peer_actor text; r jsonb; targets jsonb;
begin
 if test_session is not null then
  r:=public.nisfayn_test_rpc('state',test_session,'{}');actor_name:=r->>'actor';
  if not coalesce((r->>'matched')::boolean,false) or r#>>'{call,id}' is distinct from call_id::text or r#>>'{call,caller}' is distinct from actor_name
  or r#>>'{call,status}' is distinct from 'ringing' or (r#>>'{call,ringingUntil}')::timestamptz<=now()
  or r#>>'{callPermission,status}' is distinct from 'accepted' then return '[]';end if;
  peer_actor:=case when actor_name='abdulrahman' then 'reham' else 'abdulrahman' end;
 else
  select c.callee_id into peer from marriage.voice_calls c where c.id=call_id and c.caller_id=caller_id
  and c.status='ringing' and c.ringing_until>now() and marriage.voice_allowed(c.request_id,c.caller_id,c.callee_id);
  if peer is null then return '[]';end if;
 end if;
 delete from marriage.native_call_dispatch where created_at<now()-interval '1 day';
 with inserted as (
  insert into marriage.native_call_dispatch(call_id,installation_id)
  select call_id,d.installation_id from marriage.native_call_devices d
  where ((peer is not null and d.member_id=peer) or (peer_actor is not null and d.actor=peer_actor))
  and d.voip_token is not null and marriage.native_device_allowed(d)
  on conflict do nothing returning installation_id)
 select coalesce(jsonb_agg(jsonb_build_object('token',d.voip_token,'environment',d.environment,'callId',call_id,'installation',d.installation_id)),'[]') into targets
 from inserted i join marriage.native_call_devices d using(installation_id);
 return targets;
end $$;
revoke all on function marriage.native_call_register(uuid,text,text),public.marriage_native_call_register(uuid,text,text),public.nisfayn_test_native_register(text,uuid,text,text),marriage.native_device_allowed(marriage.native_call_devices),public.nisfayn_native_call(uuid,text,text,uuid,text),public.nisfayn_native_call_targets(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function marriage.native_call_register(uuid,text,text),public.marriage_native_call_register(uuid,text,text) to authenticated;
grant execute on function public.nisfayn_test_native_register(text,uuid,text,text),public.nisfayn_native_call(uuid,text,text,uuid,text),public.nisfayn_native_call_targets(uuid,uuid,text) to service_role;

create table marriage.notification_privacy(member_id uuid primary key references marriage.members on delete cascade,mode text not null check(mode in('private','name','content')));
create table nisfayn_test.notification_privacy(actor text primary key check(actor in('abdulrahman','reham')),mode text not null check(mode in('private','name','content')));
alter table marriage.notification_privacy enable row level security;
alter table nisfayn_test.notification_privacy enable row level security;
revoke all on marriage.notification_privacy,nisfayn_test.notification_privacy from public,anon,authenticated,service_role;
create function marriage.push_privacy(preview_mode text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if preview_mode is not null then
  if preview_mode not in('private','name','content') then raise exception 'Invalid preview';end if;
  insert into marriage.notification_privacy values(me,preview_mode) on conflict(member_id) do update set mode=excluded.mode;
 end if;
 return jsonb_build_object('preview',coalesce((select mode from marriage.notification_privacy where member_id=me),'private'));
end $$;
create function public.marriage_push_privacy(preview_mode text default null) returns jsonb language sql security invoker set search_path='' as $$select marriage.push_privacy($1)$$;
alter function nisfayn_test.push(text,text,jsonb) rename to push_before_native;
create function nisfayn_test.push(action text,session_token text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb;who text;mode text:=payload->>'preview_mode';
begin
 base:=nisfayn_test.push_before_native(case when action='push_privacy' then 'push_settings' else action end,session_token,payload);
 if action<>'push_privacy' then return base;end if;
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if mode is not null then
  if mode not in('private','name','content') then raise exception 'Invalid preview';end if;
  insert into nisfayn_test.notification_privacy values(who,mode) on conflict(actor) do update set mode=excluded.mode;
 end if;
 return jsonb_build_object('preview',coalesce((select p.mode from nisfayn_test.notification_privacy p where actor=who),'private'));
end $$;
-- Recreate the SQL wrapper to bind to the new function OID after renaming.
create or replace function public.nisfayn_test_push(action text,session_token text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select nisfayn_test.push($1,$2,$3)$$;

create function public.nisfayn_push_content(job_id uuid,lease uuid,tester boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j marriage.push_outbox;t nisfayn_test.push_outbox;d jsonb;m jsonb;msg marriage.thread_messages;
 mode text:='private';sender text;content text;mid text;badge integer:=0;peer uuid;
begin
 if tester then
  if not nisfayn_test.push_validate(job_id,lease) then return null;end if;
  select * into t from nisfayn_test.push_outbox where id=job_id;
  select data into d from nisfayn_test.room where id;
  select p.mode into mode from nisfayn_test.notification_privacy p where actor=t.actor;
  sender:=case when t.actor='reham' then 'عبدالرحمن' else 'رهام' end;
  select value into m from jsonb_array_elements(d->'messages') where value->>'id'=t.event_key;
  mid:=m->>'id';
  content:=case when m ? 'attachment' then case m#>>'{attachment,kind}' when 'audio' then 'رسالة صوتية' else 'صورة' end else left(m->>'body',160) end;
  select count(*)::integer into badge from jsonb_array_elements(d->'messages') v where v->>'sender'<>t.actor and v->>'deletedAt' is null
   and not exists(select 1 from nisfayn_test.message_deletions x where x.id::text=v->>'id')
   and (v->>'createdAt')::timestamptz>coalesce((d#>>array['read',t.actor])::timestamptz,'-infinity');
 else
  if not marriage.push_validate(job_id,lease) then return null;end if;
  select * into j from marriage.push_outbox where id=job_id;
  select case when r.requester_id=j.member_id then r.recipient_id else r.requester_id end into peer from marriage.member_requests r where r.id=j.request_id;
  select p.mode into mode from marriage.notification_privacy p where member_id=j.member_id;
  select p.display_name into sender from marriage.profiles p where member_id=peer;
  if j.kind='message' then
   select * into msg from marriage.thread_messages where id::text=replace(j.event_key,'message:','') and request_id=j.request_id;
   if msg.id is null or msg.deleted_at is not null then return null;end if;
   if exists(select 1 from marriage.thread_read_positions p where p.request_id=j.request_id and p.reader_id=j.member_id and (p.through_created_at,p.through_id)>=(msg.created_at,msg.id)) then return null;end if;
   mid:=msg.id::text;content:=left(msg.body,160);
  end if;
  select count(*)::integer into badge from marriage.thread_messages m join marriage.member_requests r on r.id=m.request_id
   left join marriage.thread_read_positions p on p.request_id=r.id and p.reader_id=j.member_id
   where r.status='accepted' and j.member_id in(r.requester_id,r.recipient_id) and m.sender_id<>j.member_id and m.deleted_at is null
   and marriage.compatible(r.requester_id,r.recipient_id) and marriage.is_paid(r.requester_id) and marriage.is_paid(r.recipient_id)
   and (m.created_at,m.id)>(coalesce(p.through_created_at,'-infinity'::timestamptz),coalesce(p.through_id,'00000000-0000-0000-0000-000000000000'::uuid));
 end if;
 return jsonb_strip_nulls(jsonb_build_object('preview',coalesce(mode,'private'),'sender',case when mode in('name','content') then left(sender,50) end,
 'body',case when mode='content' then content end,'messageId',mid,'badge',least(badge,999)));
end $$;
revoke all on function marriage.push_privacy(text),public.marriage_push_privacy(text),nisfayn_test.push(text,text,jsonb),public.nisfayn_push_content(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function marriage.push_privacy(text),public.marriage_push_privacy(text) to authenticated;
grant execute on function nisfayn_test.push(text,text,jsonb),public.nisfayn_push_content(uuid,uuid,boolean) to service_role;
