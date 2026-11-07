-- Explicit, versioned consent. Existing stage approvals never imply exclusivity.
create table marriage.exclusive_consents (
 request_id uuid references marriage.member_requests(id) on delete cascade,
 member_id uuid references marriage.members(id) on delete cascade,
 agreed_at timestamptz not null default now(), primary key(request_id,member_id)
);
create table marriage.exclusive_members (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 request_id uuid not null references marriage.member_requests(id) on delete cascade,
 agreed_at timestamptz not null default now()
);
create index exclusive_members_request on marriage.exclusive_members(request_id);
create table marriage.activity_notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references marriage.members(id) on delete cascade,
 actor_id uuid not null references marriage.members(id) on delete cascade,
 kind text not null check(kind in('profile_visit','exclusive')), request_id uuid references marriage.member_requests(id) on delete cascade,
 event_key text not null, created_at timestamptz not null default now(), read_at timestamptz,
 unique(recipient_id,event_key)
);
create index activity_notifications_recipient on marriage.activity_notifications(recipient_id,created_at desc);
alter table marriage.exclusive_consents enable row level security;
alter table marriage.exclusive_members enable row level security;
alter table marriage.activity_notifications enable row level security;
revoke all on marriage.exclusive_consents,marriage.exclusive_members,marriage.activity_notifications from public,anon,authenticated;

alter function marriage.compatible(uuid,uuid) rename to compatible_before_exclusivity;
create function marriage.compatible(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.compatible_before_exclusivity(a,b) and not exists(
  select 1 from marriage.exclusive_members e join marriage.member_requests r on r.id=e.request_id
  where e.member_id in(a,b) and not(a in(r.requester_id,r.recipient_id) and b in(r.requester_id,r.recipient_id)))
$$;
revoke all on function marriage.compatible(uuid,uuid) from public,anon,authenticated;

-- Stale clients and direct calls cannot open a competing connection.
create function marriage.guard_exclusive_connection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in('pending','accepted') then
  perform marriage.lock_member_pair(new.requester_id,new.recipient_id);
  if exists(select 1 from marriage.exclusive_members e where e.member_id in(new.requester_id,new.recipient_id) and e.request_id<>new.id) then
   raise exception 'يوجد التزام حصري قائم. أنهِ التعارف الحالي أولًا.' using errcode='42501';
  end if;
 elsif tg_op='UPDATE' and old.status='accepted' then
  delete from marriage.exclusive_members where request_id=new.id;
 end if;
 return new;
end $$;
revoke all on function marriage.guard_exclusive_connection() from public,anon,authenticated;
create trigger exclusive_connection before insert or update of status on marriage.member_requests for each row execute function marriage.guard_exclusive_connection();
create function marriage.guard_exclusive_introduction() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.closed_at is null then
  perform marriage.lock_member_pair(new.member_a,new.member_b);
  if exists(select 1 from marriage.exclusive_members where member_id in(new.member_a,new.member_b)) then
   raise exception 'الترشيح غير متاح أثناء الالتزام الحصري.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function marriage.guard_exclusive_introduction() from public,anon,authenticated;
create trigger exclusive_introduction before insert or update of closed_at on marriage.introductions for each row execute function marriage.guard_exclusive_introduction();

alter function marriage.progress_view(uuid) rename to progress_before_exclusivity;
create function marriage.progress_view(request_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid:=marriage.progress_peer(me,$1); p jsonb; mine boolean; theirs boolean; committed boolean;
begin
 p:=marriage.progress_before_exclusivity($1);
 select exists(select 1 from marriage.exclusive_members e where e.member_id=me and e.request_id=$1) into committed;
 select exists(select 1 from marriage.exclusive_consents c where c.request_id=$1 and c.member_id=me),
 exists(select 1 from marriage.exclusive_consents c where c.request_id=$1 and c.member_id=peer) into mine,theirs;
 return p||jsonb_build_object('exclusive',committed,'consentMine',mine,'consentPeer',theirs)||
  case when (p->>'stage')::int=0 then jsonb_build_object('mine',mine,'peer',theirs) else '{}'::jsonb end;
end $$;
revoke all on function marriage.progress_view(uuid) from public,anon,authenticated;
grant execute on function marriage.progress_view(uuid) to authenticated;

alter function marriage.set_next_step(uuid,integer,boolean) rename to set_next_step_before_exclusivity;
revoke all on function marriage.set_next_step_before_exclusivity(uuid,integer,boolean) from public,anon,authenticated;
create function marriage.set_next_step(request_id uuid,stage_number integer,agree boolean,exclusive_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); peer uuid:=marriage.progress_peer(me,$1); p jsonb;
begin
 perform marriage.lock_member_pair(me,peer);
 perform marriage.progress_peer(me,$1);
 p:=marriage.progress_view($1);
 if $2 is null or $3 is null or $2 not in(1,2) then raise exception 'الخطوة غير متاحة.'; end if;
 if $2=1 then
  if (p->>'exclusive')::boolean then return p; end if;
  if $3 then
   if $4 is distinct from true then raise exception 'اقرأ تنبيه الالتزام الحصري وأكّد موافقتك.'; end if;
   insert into marriage.exclusive_consents(request_id,member_id) values($1,me) on conflict do nothing;
  else delete from marriage.exclusive_consents c where c.request_id=$1 and c.member_id=me; end if;
  if (select count(*) from marriage.exclusive_consents c where c.request_id=$1 and c.member_id in(me,peer))=2 then
   insert into marriage.exclusive_members(member_id,request_id) values(me,$1),(peer,$1);
   insert into marriage.stage_choices(request_id,stage,member_id,agreed_at) values($1,1,me,now()),($1,1,peer,now()) on conflict do nothing;
   -- Close, never delete, other relationships; existing triggers end their calls and signal peers.
   update marriage.member_requests r set status='closed',updated_at=now() where r.id<>$1 and r.status in('pending','accepted')
    and (r.requester_id in(me,peer) or r.recipient_id in(me,peer));
   update marriage.introductions i set closed_at=now() where i.closed_at is null and (i.member_a in(me,peer) or i.member_b in(me,peer));
   insert into marriage.activity_notifications(recipient_id,actor_id,kind,request_id,event_key) values
    (me,peer,'exclusive',$1,'exclusive:'||$1::text),(peer,me,'exclusive',$1,'exclusive:'||$1::text) on conflict do nothing;
  end if;
 else
  if not (p->>'exclusive')::boolean then raise exception 'أكّدا الالتزام الحصري أولًا.'; end if;
  perform marriage.set_next_step_before_exclusivity($1,$2,$3);
 end if;
 begin
  perform realtime.send('{}'::jsonb,'changed','marriage:member:'||me::text,true);
  perform realtime.send('{}'::jsonb,'changed','marriage:member:'||peer::text,true);
 exception when others then null; end;
 return marriage.progress_view($1);
end $$;
create function marriage.set_next_step(request_id uuid,stage_number integer,agree boolean) returns jsonb language sql security invoker set search_path='' as $$select marriage.set_next_step($1,$2,$3,false)$$;
create function public.marriage_next_step(request_id uuid,stage_number integer,agree boolean,exclusive_consent boolean) returns jsonb language sql security invoker set search_path='' as $$select marriage.set_next_step($1,$2,$3,$4)$$;
revoke all on function marriage.set_next_step(uuid,integer,boolean),marriage.set_next_step(uuid,integer,boolean,boolean),public.marriage_next_step(uuid,integer,boolean,boolean) from public,anon,authenticated;
grant execute on function marriage.set_next_step(uuid,integer,boolean),marriage.set_next_step(uuid,integer,boolean,boolean),public.marriage_next_step(uuid,integer,boolean,boolean) to authenticated;

alter function marriage.member_card(uuid,uuid) rename to member_card_before_exclusivity;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_before_exclusivity(viewer,subject)||jsonb_build_object('exclusive',exists(select 1 from marriage.exclusive_members where member_id=subject))
$$;
revoke all on function marriage.member_card(uuid,uuid) from public,anon,authenticated;

create or replace function marriage.note_profile_open(candidate_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
 if $1=me or not marriage.compatible(me,$1) or not marriage.is_paid($1) then return; end if;
 if not exists(select 1 from marriage.fit_observations where viewer_id=me and candidate_id=$1)
  and not exists(select 1 from marriage.member_requests where status='accepted' and me in(requester_id,recipient_id) and $1 in(requester_id,recipient_id)) then return; end if;
 update marriage.fit_observations set opened_at=coalesce(opened_at,now()) where viewer_id=me and candidate_id=$1 and offer_week=marriage.current_week();
 insert into marriage.activity_notifications(recipient_id,actor_id,kind,event_key) values($1,me,'profile_visit','visit:'||me::text||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD')) on conflict do nothing;
 begin perform realtime.send('{}'::jsonb,'changed','marriage:member:'||$1::text,true); exception when others then null; end;
end $$;
create function public.marriage_notifications() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'createdAt',n.created_at,'readAt',n.read_at,'requestId',n.request_id,'person',marriage.member_card(me,n.actor_id)) order by n.created_at desc)
 from (select * from marriage.activity_notifications where recipient_id=me and marriage.compatible(me,actor_id) order by created_at desc limit 100) n),'[]'::jsonb);
end $$;
create function public.marriage_notifications_read(notification_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin update marriage.activity_notifications set read_at=now() where recipient_id=me and id=any($1) and read_at is null; end $$;
revoke all on function public.marriage_notifications(),public.marriage_notifications_read(uuid[]) from public,anon,authenticated;
grant execute on function public.marriage_notifications(),public.marriage_notifications_read(uuid[]) to authenticated;

-- Isolated two-person website test: same consent rule, authenticated via the existing session.
create table nisfayn_test.notifications(id uuid primary key default gen_random_uuid(),recipient text not null,actor text not null,kind text not null,event_key text not null,created_at timestamptz default now(),read_at timestamptz,unique(recipient,event_key));
alter table nisfayn_test.notifications enable row level security;
revoke all on nisfayn_test.notifications from public,anon,authenticated,service_role;
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_agreement_v1;
revoke all on function nisfayn_test.rpc_agreement_v1(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare who text; peer text; d jsonb; consents jsonb; result jsonb;
begin
 if action in('attempt','login','logout') then return nisfayn_test.rpc_agreement_v1(action,session_token,payload); end if;
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501'; end if;
 peer:=case who when 'reham' then 'abdulrahman' else 'reham' end;
 select data into d from nisfayn_test.room where id for update;
 if action='notifications' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'actor',n.actor,'createdAt',n.created_at,'readAt',n.read_at,'requestId','tester-pair') order by n.created_at desc) from (select * from nisfayn_test.notifications where recipient=who order by created_at desc limit 100) n),'[]'::jsonb);
 elsif action='notifications_read' then
  update nisfayn_test.notifications set read_at=now() where recipient=who and id::text in(select jsonb_array_elements_text(payload->'ids')) and read_at is null;
  return d||jsonb_build_object('actor',who);
 elsif action='profile_visit' then
  if (d->>'matched')::boolean and payload->>'person'=peer then
   insert into nisfayn_test.notifications(recipient,actor,kind,event_key) values(peer,who,'profile_visit','visit:'||who||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD')) on conflict do nothing;
  end if;
  return d||jsonb_build_object('actor',who);
 elsif action='step' and (payload->>'stage')::int=1 then
  if not (d->>'matched')::boolean then raise exception 'التعارف مغلق.'; end if;
  if coalesce((d->>'exclusive')::boolean,false) then return d||jsonb_build_object('actor',who); end if;
  consents:=coalesce(d->'exclusiveConsent','{}'::jsonb);
  if payload->'agree'='true'::jsonb then
   if payload->'exclusiveConsent' is distinct from 'true'::jsonb then raise exception 'اقرأ تنبيه الالتزام الحصري وأكّد موافقتك.'; end if;
   consents:=consents||jsonb_build_object(who,true);
  elsif payload->'agree'='false'::jsonb then consents:=consents-who;
  else raise exception 'الموافقة مطلوبة.'; end if;
  d:=d||jsonb_build_object('exclusiveConsent',consents);
  if consents->'reham'='true'::jsonb and consents->'abdulrahman'='true'::jsonb then
   d:=d||jsonb_build_object('exclusive',true,'retiredFictional',true,'stage',greatest(1,(d->>'stage')::int),'agree','{}'::jsonb);
   insert into nisfayn_test.notifications(recipient,actor,kind,event_key) values(who,peer,'exclusive','exclusive:'||gen_random_uuid()::text),(peer,who,'exclusive','exclusive:'||gen_random_uuid()::text);
  end if;
  update nisfayn_test.room set data=d where id;
  return d||jsonb_build_object('actor',who);
 elsif action='step' and not coalesce((d->>'exclusive')::boolean,false) then raise exception 'أكّدا الالتزام الحصري أولًا.';
 end if;
 result:=nisfayn_test.rpc_agreement_v1(action,session_token,payload);
 if action in('close','reset') then
  update nisfayn_test.room set data=data||'{"exclusive":false,"exclusiveConsent":{}}'::jsonb where id returning data into d;
  result:=d||jsonb_build_object('actor',who);
 end if;
 return result;
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
