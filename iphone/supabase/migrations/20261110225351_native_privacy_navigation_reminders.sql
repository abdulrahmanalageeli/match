create or replace function public.nisfayn_native_call(installation uuid,credential text,command text,call_id uuid default null,device_token text default null) returns jsonb
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
  return state||jsonb_build_object('callerName',case when d.actor='reham' then 'عبدالرحمن' else 'رهام' end,'direction',case when state->>'caller'=d.actor then 'outgoing' else 'incoming' end);
 end if;
 -- The gateway is service-only. Derive claims exclusively from the registered
 -- device and live auth session; never accept caller-supplied identity claims.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',d.member_id,'session_id',d.session_id,'role','authenticated')::text,true);
 result:=case command when 'state' then marriage.call_state(call_id)
 when 'token' then marriage.call_token_grant(call_id) else marriage.call_act(call_id,command) end;
 perform set_config('request.jwt.claims',coalesce(prior,''),true);
 return (result-'person')||jsonb_build_object('callerName',left(result#>>'{person,alias}',60));
end $$;

-- Private agreed deadlines for real members; neither expiry nor a reminder advances a stage.
create table marriage.conversation_agreements (
 request_id uuid primary key references marriage.member_requests(id) on delete cascade,
 data jsonb not null default '{"status":"none"}'
);
alter table marriage.conversation_agreements enable row level security;
revoke all on marriage.conversation_agreements from public,anon,authenticated,service_role;
create function marriage.agreement(request_id uuid,action text default 'read',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();r marriage.member_requests;d jsonb;actor text;peer uuid;n integer;
begin
 select * into r from marriage.member_requests where id=request_id for update;
 if r.id is null or me not in(r.requester_id,r.recipient_id) or r.status<>'accepted'
 or not marriage.compatible(r.requester_id,r.recipient_id) then raise exception 'المحادثة غير متاحة.' using errcode='42501';end if;
 peer:=case when me=r.requester_id then r.recipient_id else r.requester_id end;
 select case when gender='woman' then 'reham' else 'abdulrahman' end into actor from marriage.profiles where member_id=me;
 insert into marriage.conversation_agreements(request_id) values(r.id) on conflict on constraint conversation_agreements_pkey do nothing;
 select data into d from marriage.conversation_agreements a where a.request_id=r.id;
 if action='propose' then
  n:=(payload->>'days')::integer;
  if actor<>'reham' or d->>'status' not in('none','proposed') or n is null or n not in(7,14,30) or payload->'signed' is distinct from 'true'::jsonb then raise exception 'راجع اقتراح المدة والتوقيع.' using errcode='22023';end if;
  d:=jsonb_build_object('status','proposed','days',n,'proposalId',gen_random_uuid(),'womanSignedAt',now());
 elsif action='accept' then
  if actor<>'abdulrahman' or d->>'status'<>'proposed' or payload->>'proposalId' is distinct from d->>'proposalId' or payload->'signed' is distinct from 'true'::jsonb then raise exception 'راجع الاتفاق الحالي.' using errcode='42501';end if;
  d:=d||jsonb_build_object('status','accepted','manSignedAt',now(),'deadline',now()+make_interval(days=>(d->>'days')::integer));
 elsif action='extend' then
  n:=(payload->>'days')::integer;
  if d->>'status'<>'accepted' or n is null or n not in(7,14) then raise exception 'لا يمكن تمديد هذا الاتفاق.';end if;
  d:=d||jsonb_build_object('extension',jsonb_build_object('id',gen_random_uuid(),'actor',actor,'days',n));
 elsif action='extension_accept' then
  if d#>>'{extension,actor}' is null or d#>>'{extension,actor}'=actor or payload->>'proposalId' is distinct from d#>>'{extension,id}' or d->>'status'<>'accepted' then raise exception 'راجع اقتراح التمديد الحالي.' using errcode='42501';end if;
  d:=(d-'extension')||jsonb_build_object('deadline',greatest(now(),(d->>'deadline')::timestamptz)+make_interval(days=>(d#>>'{extension,days}')::integer));
 elsif action='family' then
  if d->>'status' not in('accepted','family') or payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'أكد الخطوة أولًا.';end if;
  d:=jsonb_set(d,'{familyAgreed}',coalesce(d->'familyAgreed','{}')||jsonb_build_object(actor,true));
  if d#>>'{familyAgreed,reham}'='true' and d#>>'{familyAgreed,abdulrahman}'='true' then d:=(d-'extension')||'{"status":"family"}';end if;
 elsif action<>'read' then raise exception 'Invalid action';end if;
 if action<>'read' then update marriage.conversation_agreements a set data=d where a.request_id=r.id;end if;
 return d||jsonb_build_object('actor',actor,'mineName',(select display_name from marriage.profiles where member_id=me),'peerName',(select display_name from marriage.profiles where member_id=peer));
end $$;
create function public.marriage_agreement(request_id uuid,action text default 'read',payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select marriage.agreement($1,$2,$3)$$;
revoke all on function marriage.agreement(uuid,text,jsonb),public.marriage_agreement(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.agreement(uuid,text,jsonb),public.marriage_agreement(uuid,text,jsonb) to authenticated;

-- The tester wrapper preserves the existing two-account authorization and agreement.
alter function public.nisfayn_test_rpc(text,text,jsonb) rename to nisfayn_test_rpc_before_reminders;
create function public.nisfayn_test_rpc(action text,session_token text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb;d jsonb;a jsonb;who text;n integer;
begin
 if action not in('agreement_extend','agreement_extension_accept') then return public.nisfayn_test_rpc_before_reminders(action,session_token,payload);end if;
 s:=public.nisfayn_test_rpc_before_reminders('state',session_token,'{}');who:=s->>'actor';
 if not coalesce((s->>'matched')::boolean,false) then raise exception 'المحادثة غير متاحة.' using errcode='42501';end if;
 select data into d from nisfayn_test.room where id for update;a:=d->'seriousness';
 if a->>'status' not in('accepted','expired') then raise exception 'لا يمكن تمديد هذا الاتفاق.';end if;
 if action='agreement_extend' then
  n:=(payload->>'days')::integer;if n is null or n not in(7,14) then raise exception 'اختر مدة صالحة.';end if;
  a:=a||jsonb_build_object('extension',jsonb_build_object('id',gen_random_uuid(),'actor',who,'days',n));
 else
  if a#>>'{extension,actor}' is null or a#>>'{extension,actor}'=who or payload->>'proposalId' is distinct from a#>>'{extension,id}' then raise exception 'راجع اقتراح التمديد الحالي.' using errcode='42501';end if;
  a:=(a-'extension')||jsonb_build_object('status','accepted','deadline',greatest(now(),(a->>'deadline')::timestamptz)+make_interval(days=>(a#>>'{extension,days}')::integer));
 end if;
 update nisfayn_test.room set data=jsonb_set(d,'{seriousness}',a) where id;
 return public.nisfayn_test_rpc_before_reminders('state',session_token,'{}');
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;

alter table marriage.push_outbox drop constraint push_outbox_kind_check;
alter table marriage.push_outbox add constraint push_outbox_kind_check check(kind in('request','mutual','message','reminder','family'));
alter table nisfayn_test.push_outbox drop constraint push_outbox_kind_check;
alter table nisfayn_test.push_outbox add constraint push_outbox_kind_check check(kind in('message','mutual','reminder'));
create function public.nisfayn_enqueue_deadline_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;m integer;
begin
 insert into marriage.push_outbox(installation_id,member_id,request_id,kind,event_key,expires_at)
 select d.installation_id,d.member_id,r.id,'reminder','deadline:'||(a.data->>'deadline'),(a.data->>'deadline')::timestamptz
 from marriage.conversation_agreements a join marriage.member_requests r on r.id=a.request_id
 join marriage.push_devices d on d.member_id in(r.requester_id,r.recipient_id)
 join marriage.push_preferences p on p.member_id=d.member_id and p.enabled
 where r.status='accepted' and a.data->>'status'='accepted' and (a.data->>'deadline')::timestamptz>now()
 and (a.data->>'deadline')::timestamptz<=now()+interval '24 hours'
 on conflict(installation_id,event_key) do nothing;
 get diagnostics n=row_count;
 insert into nisfayn_test.push_outbox(installation_id,actor,kind,event_key,expires_at)
 select d.installation_id,d.actor,'reminder','deadline:'||(r.data#>>'{seriousness,deadline}'),(r.data#>>'{seriousness,deadline}')::timestamptz
 from nisfayn_test.room r cross join nisfayn_test.push_devices d join nisfayn_test.push_preferences p on p.actor=d.actor and p.enabled
 where (r.data->>'matched')::boolean and r.data#>>'{seriousness,status}'='accepted'
 and (r.data#>>'{seriousness,deadline}')::timestamptz>now() and (r.data#>>'{seriousness,deadline}')::timestamptz<=now()+interval '24 hours'
 on conflict(installation_id,event_key) do nothing;
 get diagnostics m=row_count;return n+m;
end $$;
revoke all on function public.nisfayn_enqueue_deadline_reminders() from public,anon,authenticated;
grant execute on function public.nisfayn_enqueue_deadline_reminders() to service_role;

alter function marriage.push_allowed(marriage.push_outbox) rename to push_allowed_before_reminders;
create function marriage.push_allowed(job marriage.push_outbox) returns boolean
language plpgsql stable set search_path='' as $$
declare base marriage.push_outbox:=job;
begin
 if job.kind='family' then base.kind:='mutual';return marriage.push_allowed_before_reminders(base) and marriage.family_push_valid(job.event_key,'member:'||job.member_id::text,job.request_id::text);end if;
 if job.kind<>'reminder' then return marriage.push_allowed_before_reminders(job);end if;
 base.kind:='mutual';
 return marriage.push_allowed_before_reminders(base) and exists(select 1 from marriage.conversation_agreements a
 where a.request_id=job.request_id and a.data->>'status'='accepted' and job.event_key='deadline:'||(a.data->>'deadline')
 and (a.data->>'deadline')::timestamptz>now() and (a.data->>'deadline')::timestamptz<=now()+interval '24 hours');
end $$;
alter function nisfayn_test.push_allowed(nisfayn_test.push_outbox) rename to push_allowed_before_reminders;
create function nisfayn_test.push_allowed(job nisfayn_test.push_outbox) returns boolean
language plpgsql stable set search_path='' as $$
declare base nisfayn_test.push_outbox:=job;
begin
 if job.kind='family' then base.kind:='mutual';return nisfayn_test.push_allowed_before_reminders(base) and marriage.family_push_valid(job.event_key,'test:'||job.actor,'tester-pair');end if;
 if job.kind<>'reminder' then return nisfayn_test.push_allowed_before_reminders(job);end if;
 base.kind:='mutual';
 return nisfayn_test.push_allowed_before_reminders(base) and exists(select 1 from nisfayn_test.room r
 where r.data#>>'{seriousness,status}'='accepted' and job.event_key='deadline:'||(r.data#>>'{seriousness,deadline}')
 and (r.data#>>'{seriousness,deadline}')::timestamptz>now() and (r.data#>>'{seriousness,deadline}')::timestamptz<=now()+interval '24 hours');
end $$;
revoke all on function marriage.push_allowed(marriage.push_outbox),nisfayn_test.push_allowed(nisfayn_test.push_outbox) from public,anon,authenticated,service_role;

create function marriage.enqueue_family_push() returns trigger language plpgsql security definer set search_path='' as $$
declare r marriage.family_rooms;
begin
 select * into r from marriage.family_rooms where id=new.room_id;
 insert into marriage.push_outbox(installation_id,member_id,request_id,kind,event_key)
 select d.installation_id,d.member_id,r.request_id,'family','family:'||new.id from marriage.push_devices d
 join marriage.push_preferences pref on pref.member_id=d.member_id and pref.enabled
 where r.request_id is not null and 'member:'||d.member_id::text<>new.sender_key and marriage.family_room_can_read('member:'||d.member_id::text,r)
 on conflict(installation_id,event_key) do nothing;
 insert into nisfayn_test.push_outbox(installation_id,actor,kind,event_key)
 select d.installation_id,d.actor,'family','family:'||new.id from nisfayn_test.push_devices d
 join nisfayn_test.push_preferences pref on pref.actor=d.actor and pref.enabled
 where r.connection_id='tester-pair' and 'test:'||d.actor<>new.sender_key and marriage.family_room_can_read('test:'||d.actor,r)
 on conflict(installation_id,event_key) do nothing;
 return new;
end $$;
revoke all on function marriage.enqueue_family_push() from public,anon,authenticated,service_role;
create trigger family_push_insert after insert on marriage.family_messages for each row execute function marriage.enqueue_family_push();

create function marriage.family_push_valid(event_key text,actor text,connection_id text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.family_messages m join marriage.family_rooms r on r.id=m.room_id
 where 'family:'||m.id::text=event_key and r.connection_id=$3 and m.sender_key<>actor and marriage.family_room_can_read(actor,r)
 and m.created_at>coalesce((select read_at from marriage.family_reads where room_id=r.id and participant_key=actor),'-infinity'::timestamptz))
$$;
revoke all on function marriage.family_push_valid(text,text,text) from public,anon,authenticated,service_role;

alter function public.nisfayn_push_content(uuid,uuid,boolean) rename to nisfayn_push_content_before_family;
create function public.nisfayn_push_content(job_id uuid,lease uuid,tester boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare kind text;event_key text;details jsonb;m marriage.family_messages;
begin
 details:=public.nisfayn_push_content_before_family(job_id,lease,tester);
 if details is null then return null;end if;
 if tester then select o.kind,o.event_key into kind,event_key from nisfayn_test.push_outbox o where id=job_id;
 else select o.kind,o.event_key into kind,event_key from marriage.push_outbox o where id=job_id;end if;
 if kind='family' then
  select * into m from marriage.family_messages where 'family:'||id::text=event_key;
  if m.id is null then return null;end if;
  return (details-'sender'-'body')||jsonb_build_object('roomId',m.room_id,'messageId',m.id);
 end if;
 return details;
end $$;
revoke all on function public.nisfayn_push_content(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nisfayn_push_content(uuid,uuid,boolean) to service_role;
