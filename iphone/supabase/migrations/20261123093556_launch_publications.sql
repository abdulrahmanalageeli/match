-- Publishing content never grants access or carries executable code.
create table marriage.publications (
 id uuid primary key, author uuid not null, command_hash text not null, created_at timestamptz not null default now(),
 placement text not null check (placement in ('news','inbox','banner','setting')),
 screen text not null check (screen in ('all','welcome','register','application','discover','settings','membership','inbox')),
 title text not null check (length(title) between 1 and 90),
 body text not null check (length(body) between 1 and 700),
 destination text check (destination in ('discover','settings','membership','inbox','application')),
 setting_key text, test_installation uuid, audience jsonb not null default '{}', send_push boolean not null,
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 withdrawn_at timestamptz, dispatched_at timestamptz
);
create index publications_live on marriage.publications(starts_at desc) where withdrawn_at is null;
create table marriage.publication_preferences(member_id uuid primary key references marriage.members on delete cascade, news boolean not null default false);
create table marriage.publication_readers(publication_id uuid references marriage.publications on delete cascade,
 member_id uuid references marriage.members on delete cascade, opened_at timestamptz not null default now(), primary key(publication_id,member_id));
alter table marriage.publications add column accepted_count integer not null default 0, add column failed_count integer not null default 0;
alter table marriage.push_devices add column publication_build integer;
alter table marriage.push_outbox alter column request_id drop not null;
alter table marriage.push_outbox add column publication_id uuid references marriage.publications;
alter table marriage.push_outbox drop constraint push_outbox_kind_check;
alter table marriage.push_outbox add check(kind in ('request','mutual','message','reminder','family','analysis','publication'));
alter table marriage.push_outbox add check(case when kind='publication' then publication_id is not null and request_id is null else request_id is not null and publication_id is null end);
create index publication_jobs on marriage.push_outbox(publication_id) where publication_id is not null;
alter table marriage.publications enable row level security;
alter table marriage.publication_preferences enable row level security;
alter table marriage.publication_readers enable row level security;
revoke all on marriage.publications,marriage.publication_preferences,marriage.publication_readers from public,anon,authenticated,service_role;

create function marriage.publication_delivery_count() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update marriage.publications set accepted_count=accepted_count+case when new.outcome='sent' then 1 else 0 end,
  failed_count=failed_count+case when new.outcome in ('invalid','failed') then 1 else 0 end where id=new.publication_id;
 return null;
end $$;
create trigger publication_delivery_count after update of finished_at on marriage.push_outbox for each row
 when (new.publication_id is not null and old.finished_at is null and new.finished_at is not null) execute function marriage.publication_delivery_count();
revoke all on function marriage.publication_delivery_count() from public,anon,authenticated;
create function marriage.publication_visible(a jsonb, actor uuid, platform text, build integer)
returns boolean language sql stable set search_path='' as $$
 select coalesce(build>=coalesce((a->>'build')::integer,1) and build<=coalesce((a->>'maxBuild')::integer,999999) and (a->>'platform' is null or a->>'platform'=platform)
 and case when actor is null then (a - 'platform' - 'build' - 'maxBuild')='{}'::jsonb
 else exists(select from marriage.members m left join marriage.profiles p on p.member_id=m.id
  where m.id=actor and not m.suspended
  and not exists(select from marriage.family_accounts f where f.user_id=actor and p.member_id is null)
  and (a->>'staff'='true' or a->>'member'=actor::text or not exists(select from marriage.staff_accounts s where s.user_id=actor))
  and (not m.is_dummy or a->>'member'=actor::text or a->>'staff'='true')
  and (a->>'member' is null or a->>'member'=m.id::text)
  and (a->>'gender' is null or p.gender=a->>'gender')
  and (a->>'stage' is null or m.review_status=a->>'stage')
  and (a->>'tier' is null or marriage.membership_tier(m.id)=a->>'tier')
  and (a->>'staff' is null or exists(select from marriage.staff_accounts s where s.user_id=m.id and s.active))
  and (a->>'percent' is null or mod(('x'||substr(md5(m.id::text),1,8))::bit(32)::bigint,100)<(a->>'percent')::integer))
 end,false)
$$;
create function marriage.publication_valid_audience(a jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(a)='object' and a-'gender'-'member'-'stage'-'tier'-'platform'-'build'-'maxBuild'-'staff'-'percent'='{}'::jsonb
 and (not a?'gender' or a->>'gender' in ('man','woman'))
 and (not a?'stage' or a->>'stage' in ('draft','pending','approved'))
 and (not a?'tier' or a->>'tier' in ('free','premium','seriousness'))
 and (not a?'platform' or a->>'platform' in ('ios','web'))
 and (not a?'member' or a->>'member' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
 and (not a?'staff' or a->'staff'='true'::jsonb)
 and (not a?'build' or a->>'build' ~ '^[1-9][0-9]{0,5}$')
 and (not a?'maxBuild' or a->>'maxBuild' ~ '^[1-9][0-9]{0,5}$')
 and (not a?'maxBuild' or not a?'build' or (a->>'maxBuild')::integer>=(a->>'build')::integer)
 and (not a?'percent' or a->>'percent' ~ '^([1-9][0-9]?|100)$'),false)
$$;
create function marriage.publication_targets(a jsonb) returns setof marriage.push_devices language sql stable set search_path='' as $$
 select d.* from marriage.push_devices d join marriage.push_preferences p using(member_id)
 join marriage.publication_preferences pref using(member_id) join auth.sessions s on s.id=d.session_id and s.user_id=d.member_id
 where p.enabled and pref.news and (s.not_after is null or s.not_after>now())
 and marriage.publication_visible(a,d.member_id,case when d.environment='web' then 'web' else 'ios' end,d.publication_build)
$$;
create function marriage.dispatch_publications() returns void language plpgsql security definer set search_path='' as $$
declare item marriage.publications;
begin
 for item in select * from marriage.publications where send_push and dispatched_at is null and withdrawn_at is null
  and starts_at<=now() and ends_at>now() order by starts_at for update skip locked limit 10 loop
  insert into marriage.push_outbox(installation_id,member_id,kind,event_key,publication_id,expires_at)
   select d.installation_id,d.member_id,'publication','publication:'||item.id,item.id,least(item.ends_at,now()+interval '1 day')
   from marriage.publication_targets(item.audience) d where item.test_installation is null or d.installation_id=item.test_installation on conflict(installation_id,event_key) do nothing;
  update marriage.publications set dispatched_at=now() where id=item.id;
 end loop;
end $$;
select cron.schedule('wudayn-publication-dispatch','* * * * *','select marriage.dispatch_publications()');

alter function marriage.push_allowed(marriage.push_outbox) rename to push_allowed_before_publications;
create function marriage.push_allowed(job marriage.push_outbox) returns boolean language plpgsql stable set search_path='' as $$
begin
 if job.kind<>'publication' then return marriage.push_allowed_before_publications(job); end if;
 return exists(select from marriage.publications p cross join lateral marriage.publication_targets(p.audience) d where p.id=job.publication_id
 and p.withdrawn_at is null and now()>=p.starts_at and now()<p.ends_at and d.member_id=job.member_id and d.installation_id=job.installation_id);
end $$;
-- Keep the existing leasing, immediate wake, exponential retry and session checks.
create or replace function public.marriage_push_claim(delivery_environment text,batch_size integer default 20) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when j->>'kind'='publication' then j||jsonb_build_object('requestId',o.publication_id) else j end),'[]'::jsonb)
 from jsonb_array_elements(marriage.push_claim($1,$2)) j left join marriage.push_outbox o on o.id=(j->>'id')::uuid
$$;
alter function public.nisfayn_push_content(uuid,uuid,boolean) rename to nisfayn_push_content_before_publications;
create function public.nisfayn_push_content(job_id uuid,lease uuid,tester boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j marriage.push_outbox; controls jsonb;
begin
 if not tester then select * into j from marriage.push_outbox where id=job_id and kind='publication'; end if;
 if j.id is null then return public.nisfayn_push_content_before_publications(job_id,lease,tester); end if;
 if not marriage.push_validate(job_id,lease) then return null; end if;
 select p.controls into controls from marriage.push_preferences p where p.member_id=j.member_id;
 return jsonb_build_object('preview','private','badge',marriage.member_unread_total(j.member_id),'scope',
  encode(sha256(convert_to('member:'||j.member_id||':'||j.installation_id,'UTF8')),'hex'),
  'passive',marriage.push_quiet(controls,now()),'sound',coalesce((controls->>'sound')::boolean,true));
end $$;
revoke all on function public.nisfayn_push_content(uuid,uuid,boolean),public.nisfayn_push_content_before_publications(uuid,uuid,boolean),public.marriage_push_claim(text,integer) from public,anon,authenticated;
grant execute on function public.nisfayn_push_content(uuid,uuid,boolean),public.marriage_push_claim(text,integer) to service_role;

create function public.wudayn_news_preference(choice boolean default null, installation uuid default null, build integer default 1) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if installation is not null and build between 1 and 999999 then
 update marriage.push_devices set publication_build=build where installation_id=installation and member_id=me and session_id=(auth.jwt()->>'session_id')::uuid;
 end if;
 if choice is not null then insert into marriage.publication_preferences values(me,choice)
 on conflict(member_id) do update set news=excluded.news; end if;
 return coalesce((select news from marriage.publication_preferences where member_id=me),false);
end $$;
create function public.wudayn_publications(platform text,build integer,opened uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is not null and not exists(select from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=actor and (s.not_after is null or s.not_after>now())) then return '[]';end if;
 if platform not in ('web','ios') or build not between 1 and 999999 then return '[]'; end if;
 if actor is not null and opened is not null then
  insert into marriage.publication_readers select p.id,actor,now() from marriage.publications p
  where p.id=opened and p.withdrawn_at is null and now()>=p.starts_at and now()<p.ends_at and marriage.publication_visible(p.audience,actor,platform,build)
  on conflict do nothing;
 end if;
 return (select coalesce(jsonb_agg(to_jsonb(items) order by items.stamp desc),'[]'::jsonb) from (
  select p.id,p.placement,p.screen,p.title,p.body,p.destination,p.setting_key as key,p.starts_at as stamp,p.ends_at as expires,
  exists(select from marriage.publication_readers r where r.publication_id=p.id and r.member_id=actor) as opened
  from marriage.publications p where p.withdrawn_at is null and now()>=p.starts_at and now()<p.ends_at
  and (actor is not null or (p.placement in ('banner','setting') and p.screen in ('all','register','welcome')))
  and marriage.publication_visible(p.audience,actor,platform,build) order by p.starts_at desc,p.created_at desc limit 100) items);
end $$;
create function public.wudayn_publish(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner']); id_value uuid;
 a jsonb:=coalesce(payload->'audience','{}'); item marriage.publications; amount integer;
 starts timestamptz; ends timestamptz; placement text:=payload->>'placement'; setting text:=payload->>'key';
begin
 if action='list' then
  return (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from (
   select p.*, (select count(*) from marriage.publication_readers where publication_id=p.id) as opened,
    (select count(*) from marriage.push_outbox where publication_id=p.id and finished_at is null) as queued,
    p.accepted_count as accepted, p.failed_count as failed
    from marriage.publications p order by created_at desc limit 100) t);
 end if;
 id_value:=(payload->>'id')::uuid;
 if id_value is null and action<>'test_devices' then raise exception 'معرّف النشر مطلوب.'; end if;
 if action='history' then return (select coalesce(jsonb_agg(to_jsonb(h) order by h.id desc),'[]') from
  (select v.id,v.title,v.body,v.saved_at from marriage.publication_versions v where v.publication_id=id_value order by v.id desc limit 25)h);end if;
 if action='rollback' then
  update marriage.publications p set title=v.title,body=v.body,destination=v.destination from marriage.publication_versions v
  where p.id=id_value and v.publication_id=p.id and v.id=(payload->>'version')::bigint and p.withdrawn_at is null and p.ends_at>now() returning p.* into strict item;
  return jsonb_build_object('id',item.id);
 end if;
 if action='withdraw' then
  update marriage.publications set withdrawn_at=coalesce(withdrawn_at,now()) where id=id_value returning * into strict item;
  return jsonb_build_object('id',item.id);
 end if;
 if action='correct' then
  update marriage.publications p set title=btrim(payload->>'title'),body=btrim(payload->>'body'),destination=nullif(payload->>'destination','')
  where p.id=id_value and withdrawn_at is null and ends_at>now()
   and (p.placement<>'setting' or nullif(payload->>'destination','') is null)
   and (p.setting_key is null or p.setting_key not in ('pause.luna','pause.offer') or payload->>'body' in ('on','off')) returning * into strict item;
  return jsonb_build_object('id',item.id);
 end if;
 if action in ('test','test_devices') then
  if not exists(select from marriage.members m where m.id=(payload->>'testMember')::uuid and (m.id=staff.user_id or m.is_dummy)) then raise exception 'اختر حسابك أو حساب اختبار مسجّل.'; end if;
  a:=jsonb_build_object('member',payload->>'testMember'); placement:='news';setting:=null;
  if action='test_devices' then return (select coalesce(jsonb_agg(jsonb_build_object('id',d.installation_id,'platform',d.environment,'last',d.updated_at) order by d.updated_at desc),'[]') from marriage.publication_targets(a) d);end if;
  select count(*) into amount from marriage.publication_targets(a) d where d.installation_id=(payload->>'testInstallation')::uuid;
  if amount=0 then raise exception 'فعّل إشعارات الأخبار على جهاز الاختبار أولًا.'; end if;
 end if;
 if not marriage.publication_valid_audience(a) then raise exception 'تحقّق من شروط الجمهور.'; end if;
 if action='preview' then
  select count(distinct member_id) into amount from marriage.publication_targets(a);
  return jsonb_build_object('reachable',amount,'devices',(select count(*) from marriage.publication_targets(a)));
 end if;
 if action not in ('publish','test') then raise exception 'إجراء غير متاح.'; end if;
 starts:=coalesce((payload->>'starts')::timestamptz,statement_timestamp()); ends:=(payload->>'ends')::timestamptz;
 if action='test' then starts:=now();ends:=now()+interval '1 hour';end if;
 if ends is null or ends<=greatest(starts,now()) then raise exception 'وقت انتهاء النشر غير صالح.'; end if;
 if placement='setting' then
  if setting is null or (setting not in ('luna.example','help.intro','pause.luna','pause.offer') and setting !~ '^welcome[.]([0-9]|1[0-2])[.][01]$')
   or coalesce((payload->>'push')::boolean,false) or nullif(payload->>'destination','') is not null then raise exception 'إعداد غير مدعوم في هذا الإصدار.'; end if;
  if setting in ('pause.luna','pause.offer') and (a<>'{}' or payload->>'body' not in ('on','off')) then raise exception 'إعداد الإيقاف عام، وقيمته on أو off.'; end if;
 elsif setting is not null then raise exception 'مفتاح غير متوقع.'; end if;
 if a->>'member' is not null and not exists(select from marriage.members where id=(a->>'member')::uuid) then raise exception 'تعذّر العثور على العضو.'; end if;
 insert into marriage.publications(id,author,command_hash,placement,screen,title,body,destination,setting_key,test_installation,audience,send_push,starts_at,ends_at)
 values(id_value,staff.user_id,md5(jsonb_build_array(action,payload-'id')::text),placement,payload->>'screen',btrim(payload->>'title'),btrim(payload->>'body'),nullif(payload->>'destination',''),setting,case when action='test' then (payload->>'testInstallation')::uuid end,a,
 coalesce((payload->>'push')::boolean,false),starts,ends) on conflict (id) do nothing;
 if not found and not exists(select from marriage.publications p where p.id=id_value and p.author=staff.user_id and p.command_hash=md5(jsonb_build_array(action,payload-'id')::text)) then
  raise exception 'تغيّر طلب النشر. حدّث الصفحة.'; end if;
 perform marriage.dispatch_publications();
 return jsonb_build_object('id',id_value,'devices',amount);
end $$;
create function marriage.publication_paused(setting text) returns boolean language sql stable set search_path='' as $$
 select coalesce((select body='on' from marriage.publications where placement='setting' and setting_key=setting
 and starts_at<=now() and ends_at>now() and withdrawn_at is null order by starts_at desc,created_at desc limit 1),false)
$$;
alter function public.marriage_luna_search_reserve() rename to marriage_luna_search_before_publications;
create function public.marriage_luna_search_reserve() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if marriage.publication_paused('pause.luna') then raise exception 'البحث مع لونا متوقف مؤقتًا. جرّب لاحقًا.'; end if;
 return public.marriage_luna_search_before_publications();
end $$;
alter function public.marriage_prepare_launch_offer(uuid,text,boolean) rename to marriage_launch_offer_before_publications;
create function public.marriage_prepare_launch_offer(actor uuid,apple_transaction text,claim boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if marriage.publication_paused('pause.offer') and not exists(select from marriage.launch_offer_claims where member_id=actor and app_transaction_id=apple_transaction) then
  return public.marriage_launch_offer_before_publications(actor,apple_transaction,false)||'{"eligible":false,"reserved":false}'::jsonb;
 end if;
 return public.marriage_launch_offer_before_publications(actor,apple_transaction,claim);
end $$;
revoke all on function marriage.publication_visible(jsonb,uuid,text,integer),marriage.publication_valid_audience(jsonb),marriage.publication_targets(jsonb),
 marriage.dispatch_publications(),marriage.publication_paused(text),marriage.push_allowed(marriage.push_outbox),public.wudayn_publications(text,integer,uuid),
 public.wudayn_publish(text,jsonb),public.wudayn_news_preference(boolean,uuid,integer),public.marriage_luna_search_reserve(),
 public.marriage_prepare_launch_offer(uuid,text,boolean),public.marriage_luna_search_before_publications(),public.marriage_launch_offer_before_publications(uuid,text,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.wudayn_publications(text,integer,uuid) to anon,authenticated;
grant execute on function public.wudayn_news_preference(boolean,uuid,integer),public.wudayn_publish(text,jsonb),public.marriage_luna_search_reserve() to authenticated;
grant execute on function public.marriage_prepare_launch_offer(uuid,text,boolean) to service_role;
create function public.wudayn_admin_luna_block(target uuid,blocked boolean,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner']);
begin
 if blocked is null or length(btrim(coalesce(reason,''))) not between 3 and 500 or not exists(select from marriage.members where id=target) then raise exception 'تحقّق من الحساب وسبب الإجراء.';end if;
 insert into marriage.luna_search_usage(member_id,blocked) values(target,blocked)
 on conflict(member_id) do update set blocked=excluded.blocked where marriage.luna_search_usage.blocked is distinct from excluded.blocked;
 if found then insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
 values(staff.user_id,staff.display_name,staff.role,case when blocked then 'luna_search_paused' else 'luna_search_resumed' end,'member',target,btrim(reason));end if;
end $$;

alter table marriage.staff_audit drop constraint staff_audit_target_type_check;
alter table marriage.staff_audit add constraint staff_audit_target_type_check check(target_type in('member','report','staff','staff_invitation','family_link','verification','publication'));
create table marriage.publication_versions (
 id bigint generated always as identity primary key, publication_id uuid not null references marriage.publications on delete cascade,
 title text not null, body text not null, destination text, saved_at timestamptz not null default now()
);
alter table marriage.publication_versions enable row level security;
revoke all on marriage.publication_versions from public,anon,authenticated,service_role;
create function marriage.audit_publication() returns trigger language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts; action text;
begin
 if tg_op='INSERT' then action:='publication_created';
 elsif old.withdrawn_at is distinct from new.withdrawn_at then action:='publication_withdrawn';
 elsif (old.title,old.body,old.destination) is distinct from (new.title,new.body,new.destination) then
  action:='publication_corrected'; insert into marriage.publication_versions(publication_id,title,body,destination) values(old.id,old.title,old.body,old.destination);
 else return null;end if;
 staff:=marriage.require_staff(array['owner']);
 perform realtime.send('{}'::jsonb,'refresh','wudayn:publications',false);
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
 values(staff.user_id,staff.display_name,staff.role,action,'publication',new.id,'منشور · '||new.title);
 return null;
end $$;
create trigger publication_created after insert on marriage.publications for each row execute function marriage.audit_publication();
create trigger publication_changed after update of withdrawn_at,title,body,destination on marriage.publications for each row execute function marriage.audit_publication();

create function public.wudayn_staff_search(query text,before_id bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare q text:=lower(btrim(query));
begin
 perform marriage.require_staff(array['owner']);
 if length(coalesce(q,'')) not between 2 and 150 then raise exception 'أدخل حرفين على الأقل للبحث.';end if;
 return (select coalesce(jsonb_agg(to_jsonb(row) order by row.n desc),'[]'::jsonb) from (
 select a.id as n,a.id::text as id,a.actor_name as "actorName",a.actor_role as "actorRole",a.actor_id as "actorId",a.action,
 a.target_type as "targetType",a.target_id as "targetId",a.reason,a.created_at as "createdAt" from marriage.staff_audit a
 where (before_id is null or a.id<before_id) and (a.target_id::text=q or a.actor_id::text=q or strpos(lower(a.actor_name),q)>0 or strpos(lower(a.action),q)>0 or strpos(lower(a.reason),q)>0)
 order by a.id desc limit 100) row);
end $$;
revoke all on function marriage.audit_publication(),public.wudayn_admin_luna_block(uuid,boolean,text),public.wudayn_staff_search(text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.wudayn_admin_luna_block(uuid,boolean,text),public.wudayn_staff_search(text,bigint) to authenticated;
