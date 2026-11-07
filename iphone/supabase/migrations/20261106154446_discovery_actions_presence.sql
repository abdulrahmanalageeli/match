-- Member-owned discovery choices, no anonymous table access or raw presence timestamps.
create table marriage.discovery_choices (
 member_id uuid not null references marriage.members(id) on delete cascade,
 subject_id uuid not null references marriage.members(id) on delete cascade,
 interested boolean not null default false, hidden boolean not null default false,
 updated_at timestamptz not null default now(),primary key(member_id,subject_id),check(member_id<>subject_id)
);
create table marriage.member_presence(member_id uuid primary key references marriage.members(id) on delete cascade,last_seen timestamptz not null default now());
alter table marriage.discovery_choices enable row level security;
alter table marriage.member_presence enable row level security;
revoke all on marriage.discovery_choices,marriage.member_presence from public,anon,authenticated;
alter table marriage.activity_notifications drop constraint activity_notifications_kind_check;
alter table marriage.activity_notifications add constraint activity_notifications_kind_check check(kind in('profile_visit','exclusive','interest'));
create function marriage.heartbeat() returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();begin
 insert into marriage.member_presence(member_id) values(me) on conflict(member_id) do update set last_seen=now()
 where marriage.member_presence.last_seen<now()-interval '20 seconds';
end $$;
create function public.marriage_heartbeat() returns void language sql security invoker set search_path='' as $$select marriage.heartbeat()$$;
create function marriage.discovery_action(member_id uuid,action text,reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();begin
 if $1 is null or $1=me then raise exception 'العضو غير متاح.' using errcode='42501';end if;
 perform marriage.lock_member_pair(me,$1);
 if not marriage.is_paid($1) or not marriage.compatible(me,$1) then raise exception 'العضو غير متاح.' using errcode='42501';end if;
 if action='interest' then
  if exists(select 1 from marriage.exclusive_members em where em.member_id in(me,$1)) then raise exception 'الاهتمام غير متاح أثناء التعارف الحصري.' using errcode='42501';end if;
  if exists(select 1 from marriage.member_requests r where me in(r.requester_id,r.recipient_id) and $1 in(r.requester_id,r.recipient_id) and r.status in('declined','closed','cancelled') and not(r.status='cancelled' and r.allow_rematch)) then raise exception 'هذا العضو غير متاح.' using errcode='42501';end if;
  if (select count(*) from marriage.activity_notifications where actor_id=me and kind='interest' and created_at>now()-interval '1 hour')>=30 then raise exception 'تمهّل قليلًا قبل إرسال اهتمام جديد.';end if;
  insert into marriage.discovery_choices(member_id,subject_id,interested) values(me,$1,true)
   on conflict on constraint discovery_choices_pkey do update set interested=true,updated_at=now();
  insert into marriage.activity_notifications(recipient_id,actor_id,kind,event_key) values($1,me,'interest','interest:'||me::text||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD')) on conflict do nothing;
 elsif action='uninterest' then update marriage.discovery_choices set interested=false,updated_at=now() where discovery_choices.member_id=me and subject_id=$1;
 elsif action in('dismiss','report') then
  if action='report' then
   if length(btrim(coalesce(reason,''))) not between 3 and 500 then raise exception 'أدخل سبب البلاغ من ٣ إلى ٥٠٠ حرف.' using errcode='22023';end if;
   if not exists(select 1 from marriage.reports where reports.member_id=me and reported_id=$1) then
    insert into marriage.reports(member_id,reported_id,reason) values(me,$1,btrim($3));end if;
   insert into marriage.blocks(member_id,blocked_id) values(me,$1) on conflict do nothing;
  end if;
  insert into marriage.discovery_choices(member_id,subject_id,hidden) values(me,$1,true)
   on conflict on constraint discovery_choices_pkey do update set hidden=true,interested=false,updated_at=now();
 else raise exception 'الإجراء غير متاح.' using errcode='22023';end if;
 begin
  perform realtime.send('{}'::jsonb,'changed','marriage:member:'||me::text,true);
  if action in('interest','report') then perform realtime.send('{}'::jsonb,'changed','marriage:member:'||$1::text,true);end if;
 exception when others then null;end;
end $$;
create function public.marriage_discovery_action(member_id uuid,action text,reason text default null) returns void
language sql security invoker set search_path='' as $$select marriage.discovery_action($1,$2,$3)$$;
revoke all on function marriage.heartbeat(),public.marriage_heartbeat(),marriage.discovery_action(uuid,text,text),public.marriage_discovery_action(uuid,text,text) from public,anon;
grant execute on function marriage.heartbeat(),public.marriage_heartbeat(),marriage.discovery_action(uuid,text,text),public.marriage_discovery_action(uuid,text,text) to authenticated;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_discovery_actions;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_before_discovery_actions($1,$2)||jsonb_build_object(
 'online',exists(select 1 from marriage.member_presence where member_id=$2 and last_seen>now()-interval '90 seconds'),
 'interested',exists(select 1 from marriage.discovery_choices where member_id=$1 and subject_id=$2 and interested))
$$;
revoke all on function marriage.member_card(uuid,uuid) from public,anon,authenticated;
-- Inject filters before pagination; omitted identity is never inferred.
do $$ declare def text;begin
 def:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 if position('where p.member_id<>me and marriage.is_paid(p.member_id)' in def)=0 then raise exception 'Unexpected browse definition';end if;
 def:=replace(def,'where p.member_id<>me and marriage.is_paid(p.member_id)',
 $filter$where p.member_id<>me
 and not exists(select 1 from marriage.discovery_choices dc where dc.member_id=me and dc.subject_id=p.member_id and dc.hidden)
 and (coalesce(options->>'nationality','')='' or marriage.normalize_nationality(b.nationality)=marriage.normalize_nationality(options->>'nationality'))
 and (coalesce(options->>'tribalBackground','')='' or b.tribal_background=options->>'tribalBackground')
 and not coalesce(options->'excludeCities','[]'::jsonb)?c.label
 and not exists(select 1 from jsonb_array_elements_text(coalesce(options->'excludeNationalities','[]'::jsonb)) excluded(value) where marriage.normalize_nationality(excluded.value)=marriage.normalize_nationality(b.nationality))
 and not coalesce(options->'excludeTribalBackgrounds','[]'::jsonb)?coalesce(b.tribal_background,'')
 and not coalesce(options->'excludeSmoking','[]'::jsonb)?coalesce(b.smoking,'')
 and not coalesce(options->'excludeMaritalStatuses','[]'::jsonb)?coalesce(b.marital_status,'')
 and (coalesce((options->>'onlineOnly')::boolean,false)=false or exists(select 1 from marriage.member_presence mp where mp.member_id=p.member_id and mp.last_seen>now()-interval '90 seconds'))
 and marriage.is_paid(p.member_id)$filter$);execute def;
 def:=pg_get_functiondef('marriage.discover(integer,integer,text,uuid)'::regprocedure);
 if position('where s.member_id=me and s.week_start=w' in def)=0 then raise exception 'Unexpected discover definition';end if;
 def:=replace(def,'where s.member_id=me and s.week_start=w','where s.member_id=me and s.week_start=w and not exists(select 1 from marriage.discovery_choices dc where dc.member_id=me and dc.subject_id=s.candidate_id and dc.hidden)');execute def;
end $$;

-- Isolated pair-test choices and heartbeat. Session + admin gates are reused.
create table nisfayn_test.presence(actor text primary key check(actor in('abdulrahman','reham')),last_seen timestamptz not null default now());
alter table nisfayn_test.presence enable row level security;
revoke all on nisfayn_test.presence from public,anon,authenticated,service_role;
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_discovery_actions;
revoke all on function nisfayn_test.rpc_before_discovery_actions(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;d jsonb;who text;peer text;begin
 if action in('heartbeat','interest','uninterest','dismiss_person','report_person') then
  result:=nisfayn_test.rpc_before_discovery_actions('state',session_token,'{}');who:=result->>'actor';peer:=case who when 'reham' then 'abdulrahman' else 'reham' end;
  select data into d from nisfayn_test.room where id for update;
  if action='heartbeat' then
   insert into nisfayn_test.presence(actor) values(who) on conflict(actor) do update set last_seen=now() where nisfayn_test.presence.last_seen<now()-interval '20 seconds';
  else
   if payload->>'person' is distinct from peer then raise exception 'العضو غير متاح.' using errcode='42501';end if;
   perform 1 from marriage.admin_test_members where actor=peer and not paused and not suspended and review_status='approved' and access_until>now();
   if not found then raise exception 'الطرف الآخر غير متاح.' using errcode='42501';end if;
   if action='interest' then
    if coalesce((d->>'exclusive')::boolean,false) or (not coalesce((d->>'matched')::boolean,false) and not coalesce((d->>'allowRematch')::boolean,false)) then raise exception 'هذا العضو غير متاح.' using errcode='42501';end if;
    d:=jsonb_set(d,'{interests}',coalesce(d->'interests','{}')||jsonb_build_object(who,true));
    insert into nisfayn_test.notifications(recipient,actor,kind,event_key) values(peer,who,'interest','interest:'||who||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD')) on conflict do nothing;
   elsif action='uninterest' then d:=jsonb_set(d,'{interests}',coalesce(d->'interests','{}')||jsonb_build_object(who,false));
   elsif action='report_person' then
    result:=nisfayn_test.rpc_before_discovery_actions('close',session_token,jsonb_build_object('report',true,'reason',payload->>'reason'));
    select data into d from nisfayn_test.room where id;
    d:=jsonb_set(d,'{hiddenPeople}',coalesce(d->'hiddenPeople','{}')||jsonb_build_object(who,true));
   else d:=jsonb_set(d,'{hiddenPeople}',coalesce(d->'hiddenPeople','{}')||jsonb_build_object(who,true));end if;
   update nisfayn_test.room set data=d where id;
  end if;
  result:=d||jsonb_build_object('actor',who,'profileRevision',result->'profileRevision');
 else result:=nisfayn_test.rpc_before_discovery_actions(action,session_token,payload);end if;
 if jsonb_typeof(result)='object' and result?'profiles' then
  result:=result||jsonb_build_object('onlineActors',coalesce((select jsonb_object_agg(actor,last_seen>now()-interval '90 seconds') from nisfayn_test.presence),'{}'::jsonb));end if;
 return result;
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
