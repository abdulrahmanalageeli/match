-- Isolated, explicitly fictional two-person preview. No production member access.
create schema nisfayn_test;
revoke all on schema nisfayn_test from public,anon,authenticated;
create table nisfayn_test.sessions(token_hash bytea primary key, actor text not null check(actor in('abdulrahman','reham')),expires_at timestamptz not null);
create table nisfayn_test.room(id boolean primary key default true check(id),data jsonb not null);
insert into nisfayn_test.room values(true,'{"matched":true,"messages":[],"read":{},"profiles":{},"stage":0,"agree":{},"call":null}');
create table nisfayn_test.login_limit(id boolean primary key default true check(id),window_at timestamptz not null,n integer not null);
insert into nisfayn_test.login_limit values(true,now(),0);
alter table nisfayn_test.sessions enable row level security;
alter table nisfayn_test.room enable row level security;
alter table nisfayn_test.login_limit enable row level security;
revoke all on all tables in schema nisfayn_test from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text; d jsonb; c jsonb; msg jsonb; result jsonb; cid uuid; expiry timestamptz; count_recent integer;
begin
 if action='attempt' then
  update nisfayn_test.login_limit set n=case when window_at<now()-interval '1 minute' then 1 else n+1 end,
    window_at=case when window_at<now()-interval '1 minute' then now() else window_at end where id returning n into count_recent;
  return to_jsonb(count_recent<=20);
 end if;
 if action='login' then
  actor:=payload->>'actor';
  if actor not in('abdulrahman','reham') or actor is null or length(session_token)<>64 then raise exception 'Invalid login'; end if;
  insert into nisfayn_test.sessions values(sha256(session_token::bytea),actor,now()+interval '24 hours');
  return jsonb_build_object('actor',actor);
 end if;
 select s.actor into actor from nisfayn_test.sessions s where s.token_hash=sha256(session_token::bytea) and expires_at>now();
 if actor is null then raise exception 'انتهت جلسة الاختبار. سجّل الدخول مجددًا.' using errcode='42501'; end if;
 if action='logout' then update nisfayn_test.sessions set expires_at=now() where token_hash=sha256(session_token::bytea);return 'true';end if;
 select data into d from nisfayn_test.room where id for update;
 c:=nullif(d->'call','null');
 if c is not null and c->>'status'<>'ended' and ((c->>'status'='ringing' and (c->>'ringingUntil')::timestamptz<=now()) or
  (c->>'status'='active' and ((c->>'deadline')::timestamptz<=now() or (c#>>'{leases,abdulrahman}')::timestamptz<=now() or (c#>>'{leases,reham}')::timestamptz<=now()))) then
  c:=c||jsonb_build_object('status','ended','endedAt',now(),'endReason',case when c->>'status'='ringing' then 'missed' else 'expired' end);
 end if;
 if action='send' then
  if not (d->>'matched')::boolean then raise exception 'التعارف مغلق.' using errcode='42501'; end if;
  if length(trim(payload->>'body')) not between 1 and 1000 or payload->>'body' is null then raise exception 'رسالة غير صالحة.';end if;
  cid:=(payload->>'clientId')::uuid;
  if not exists(select 1 from jsonb_array_elements(d->'messages') m where m->>'id'=cid::text and m->>'sender'=actor) then
   if (select count(*) from jsonb_array_elements(d->'messages') m where m->>'sender'=actor and (m->>'createdAt')::timestamptz>now()-interval '1 minute')>=30 then raise exception 'انتظر قليلًا قبل إرسال المزيد.';end if;
   msg:=jsonb_build_object('id',cid,'clientId',cid,'sender',actor,'body',trim(payload->>'body'),'createdAt',now());
   d:=jsonb_set(d,'{messages}',coalesce((select jsonb_agg(v order by ord) from (select value v,ordinality ord from jsonb_array_elements((d->'messages')||jsonb_build_array(msg)) with ordinality order by ordinality desc limit 500) q),'[]'));
  end if;
 elsif action='read' then
  select m into msg from jsonb_array_elements(d->'messages') m where m->>'id'=payload->>'id';
  if msg is not null then d:=jsonb_set(d,array['read',actor],to_jsonb(greatest(coalesce(d#>>array['read',actor],''),msg->>'createdAt')));end if;
 elsif action='profile' then
  if jsonb_typeof(payload->'profile')<>'object' or octet_length((payload->'profile')::text)>20000 then raise exception 'ملف غير صالح.';end if;
  d:=jsonb_set(d,array['profiles',actor],(payload->'profile')||jsonb_build_object('displayName',case when actor='reham' then 'رهام' else 'عبدالرحمن' end,'gender',case when actor='reham' then 'woman' else 'man' end));
 elsif action='close' then
  d:=jsonb_set(d,'{matched}','false');
  if c is not null then c:=c||jsonb_build_object('status','ended','endedAt',now(),'endReason','unavailable');end if;
 elsif action='reset' then
  if actor<>'abdulrahman' then raise exception 'غير مسموح.' using errcode='42501';end if;
  d:=d||'{"matched":true,"stage":0,"agree":{}}'::jsonb;
 elsif action='step' then
  if not (d->>'matched')::boolean or (payload->>'stage')::integer<>(d->>'stage')::integer+1 or (payload->>'stage')::integer>2 then raise exception 'الخطوة غير متاحة.';end if;
  d:=jsonb_set(d,array['agree',actor],to_jsonb((payload->>'agree')::boolean));
  if coalesce((d#>>'{agree,reham}')::boolean,false) and coalesce((d#>>'{agree,abdulrahman}')::boolean,false) then
   d:=d||jsonb_build_object('stage',(d->>'stage')::integer+1,'agree','{}'::jsonb);
  end if;
 elsif action='call_start' then
  if not (d->>'matched')::boolean then raise exception 'التعارف مغلق.' using errcode='42501';end if;
  if c is not null and c->>'status'<>'ended' then
   if c->>'caller'<>actor or c->>'clientId'<>payload->>'clientId' then raise exception 'هناك مكالمة قيد التنفيذ.';end if;
  else
   c:=jsonb_build_object('id',gen_random_uuid(),'clientId',(payload->>'clientId')::uuid,'caller',actor,'requestId','tester-pair','status','ringing','createdAt',now(),'ringingUntil',now()+interval '45 seconds','acceptedAt',null,'endedAt',null,'endReason',null);
  end if;
 elsif action in('call_accept','call_decline','call_end','token') then
  if c is null or c->>'id'<>payload->>'callId' then raise exception 'المكالمة غير متاحة.' using errcode='42501';end if;
  if action='token' then
   if c->>'status'<>'active' or not (d->>'matched')::boolean then raise exception 'المكالمة غير متاحة.' using errcode='42501';end if;
   c:=jsonb_set(c,array['leases',actor],to_jsonb(now()+interval '3 minutes'));
   expiry:=least(now()+interval '120 seconds',(c->>'deadline')::timestamptz);
   result:=jsonb_build_object('callId',c->>'id','channel','n_'||replace(c->>'id','-',''),'uid',case when actor='abdulrahman' then 1 else 2 end,'ttlSeconds',least(120,extract(epoch from(expiry-now()))::int),'expiresAt',expiry);
  elsif c->>'status'<>'ended' then
   if action in('call_accept','call_decline') and c->>'caller'=actor then raise exception 'لا يمكنك الرد على مكالمتك.' using errcode='42501';end if;
   if action='call_accept' and c->>'status'='ringing' then
    c:=c||jsonb_build_object('status','active','acceptedAt',now(),'deadline',now()+interval '2 hours','leases',jsonb_build_object('reham',now()+interval '3 minutes','abdulrahman',now()+interval '3 minutes'));
   elsif action in('call_end','call_decline') then c:=c||jsonb_build_object('status','ended','endedAt',now(),'endReason',case when action='call_decline' then 'declined' else 'ended' end);end if;
  end if;
 elsif action<>'state' then raise exception 'إجراء غير صالح.';end if;
 d:=jsonb_set(d,'{call}',coalesce(c,'null'));
 update nisfayn_test.room set data=d where id;
 return coalesce(result,d||jsonb_build_object('actor',actor));
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
