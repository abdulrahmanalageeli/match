-- Keep registration, settings and safety available during pre-launch.
create table marriage.registration_phase (
 singleton boolean primary key default true check(singleton), locked boolean not null default false,
 revision integer not null default 0, wave integer not null default 1, announced boolean not null default false, audit_id uuid not null default gen_random_uuid()
);
insert into marriage.registration_phase default values;
create table marriage.registration_exceptions(member_id uuid primary key references marriage.members on delete cascade);
create table marriage.launch_alert_devices(installation_id uuid primary key references marriage.push_devices on delete cascade,
 member_id uuid not null references marriage.members on delete cascade, wave integer not null);
create index launch_alert_members on marriage.launch_alert_devices(member_id,wave);
alter table marriage.publications add column launch_wave integer unique;
alter table marriage.registration_phase enable row level security;
alter table marriage.registration_exceptions enable row level security;
alter table marriage.launch_alert_devices enable row level security;
revoke all on marriage.registration_phase,marriage.registration_exceptions,marriage.launch_alert_devices from public,anon,authenticated,service_role;

create function marriage.launch_admitted(member uuid) returns boolean language sql stable set search_path='' as $$
 select not (select locked from marriage.registration_phase) or exists(select from marriage.registration_exceptions where member_id=$1)
$$;

-- Preserve the original OIDs so attached policies also see the new rules.
do $$ declare sig text; name text; definition text; begin
 foreach sig in array array['compatible(uuid,uuid)','relationship_member_allowed(uuid)','require_discovery_member()','member_state(uuid)','push_allowed(marriage.push_outbox)'] loop
  name:=split_part(sig,'(',1);
  definition:=pg_get_functiondef(('marriage.'||sig)::regprocedure);
  execute replace(definition,'FUNCTION marriage.'||name||'(','FUNCTION marriage.'||name||'_before_registration_phase(');
  execute 'revoke all on function marriage.'||replace(sig,name||'(',name||'_before_registration_phase(')||' from public,anon,authenticated,service_role';
 end loop;
end $$;
create or replace function marriage.compatible(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.launch_admitted(a) and marriage.launch_admitted(b) and marriage.compatible_before_registration_phase(a,b)
$$;
create or replace function marriage.relationship_member_allowed(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.launch_admitted(target) and marriage.relationship_member_allowed_before_registration_phase(target)
$$;
create or replace function marriage.require_discovery_member() returns uuid language plpgsql stable set search_path='' as $$
declare me uuid:=marriage.require_discovery_member_before_registration_phase(); begin
 if not marriage.launch_admitted(me) then raise exception 'نستقبل التسجيل الآن. يفتح الاكتشاف مع الإطلاق.' using errcode='42501';end if;
 return me;
end $$;
create or replace function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare state jsonb:=marriage.member_state_before_registration_phase(target); waiting boolean:=not marriage.launch_admitted(target); begin
 if waiting then state:=jsonb_set(state || jsonb_build_object('introduction',null),'{membership,canStart}','false'); end if;
 return state || jsonb_build_object('prelaunch',jsonb_build_object('locked',waiting,'subscribed',
 exists(select from marriage.launch_alert_devices a join marriage.registration_phase p on a.wave=p.wave
 join marriage.push_devices d on d.installation_id=a.installation_id and d.member_id=a.member_id
 join auth.sessions s on s.id=d.session_id and s.user_id=d.member_id where a.member_id=target and (s.not_after is null or s.not_after>now()))));
end $$;

create function marriage.set_launch_alert(subscribe boolean, installation uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); p marriage.registration_phase; begin
 select * into p from marriage.registration_phase for share;
 if subscribe is false then delete from marriage.launch_alert_devices where member_id=me; return false; end if;
 if subscribe is not true or not p.locked or marriage.launch_admitted(me) then raise exception 'لم يعد التسجيل المبكر مفتوحًا.' using errcode='22023';end if;
 if not exists(select from marriage.push_devices where installation_id=installation and member_id=me and session_id=(auth.jwt()->>'session_id')::uuid)
 then raise exception 'فعّل إشعارات هذا الجهاز أولًا.' using errcode='42501';end if;
 insert into marriage.launch_alert_devices(installation_id,member_id,wave) values(installation,me,p.wave)
 on conflict(installation_id) do update set member_id=excluded.member_id,wave=excluded.wave;
 return true;
end $$;
create function marriage.launch_alert_targets(which_wave integer) returns setof marriage.push_devices language sql stable set search_path='' as $$
 select d.* from marriage.launch_alert_devices a join marriage.push_devices d using(installation_id,member_id)
 join marriage.members m on m.id=d.member_id join auth.sessions s on s.id=d.session_id and s.user_id=d.member_id
 where a.wave=which_wave and not m.suspended and (s.not_after is null or s.not_after>now())
$$;
create or replace function marriage.push_allowed(job marriage.push_outbox) returns boolean language plpgsql stable set search_path='' as $$
declare cohort integer; begin
 if job.publication_id is not null then select launch_wave into cohort from marriage.publications where id=job.publication_id; end if;
 if cohort is null then return marriage.push_allowed_before_registration_phase(job); end if;
 return exists(select from marriage.registration_phase p join marriage.publications n on n.launch_wave=p.wave
  where p.wave=cohort and not p.locked and n.withdrawn_at is null and n.ends_at>now())
 and exists(select from marriage.launch_alert_targets(cohort) d where d.member_id=job.member_id and d.installation_id=job.installation_id);
end $$;

create function marriage.registration_phase_admin(action text default 'read', expected_revision integer default null, member uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner']); p marriage.registration_phase; notice uuid; changed boolean:=true; begin
 select * into p from marriage.registration_phase for update;
 if action is null or action not in ('read','lock','open','launch','include','exclude') then raise exception 'إجراء غير معروف.' using errcode='22023'; end if;
 if action<>'read' then
  if expected_revision is distinct from p.revision then raise exception 'تغيّرت الإعدادات. أعد تحميلها.' using errcode='40001';end if;
  if action in ('include','exclude') then
   if member is null or not exists(select from marriage.members where id=member) then raise exception 'لم نعثر على العضو.' using errcode='22023';end if;
   if action='exclude' then insert into marriage.registration_exceptions values(member) on conflict do nothing;
   else delete from marriage.registration_exceptions where member_id=member; end if;
   changed:=found;
  elsif action='lock' then
   changed:=not p.locked;
   if changed then
    update marriage.registration_phase set locked=true,wave=wave+case when announced then 1 else 0 end, announced=false;
   end if;
  elsif action='open' then
   changed:=p.locked; update marriage.registration_phase set locked=false;
  else
   changed:=not p.announced;
   if changed then
    update marriage.registration_phase set announced=true,locked=false;
    notice:=gen_random_uuid();
    insert into marriage.publications(id,author,command_hash,placement,screen,title,body,destination,send_push,audience,starts_at,ends_at,dispatched_at,launch_wave)
    values(notice,staff.user_id,'launch-'||p.wave,'news','all','انطلق وُدَين','أصبح الاكتشاف متاحًا. أهلًا بك في وُدَين.','discover',false,'{}',now(),now()+interval '7 days',now(),p.wave);
    insert into marriage.push_outbox(installation_id,member_id,kind,event_key,publication_id,expires_at)
    select d.installation_id,d.member_id,'publication','launch:'||p.wave,notice,now()+interval '1 day' from marriage.launch_alert_targets(p.wave) d
    on conflict(installation_id,event_key) do nothing;
   end if;
  end if;
  if changed then
   update marriage.registration_phase set revision=revision+1 returning * into p;
   perform realtime.send('{}'::jsonb,'registration-phase','wudayn:publications',false);
   insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,result)
   values(staff.user_id,staff.display_name,staff.role,'registration_phase_updated',case when action in ('include','exclude') then 'member' else 'release_policy' end,
    coalesce(member,p.audit_id),'تعديل مرحلة التسجيل المبكر',jsonb_build_object('action',action,'revision',p.revision));
  end if;
 end if;
 return jsonb_build_object('locked',p.locked,'announced',p.announced,'revision',p.revision,'subscribers',(select count(distinct member_id) from marriage.launch_alert_targets(p.wave)),
 'exceptions',(select coalesce(jsonb_agg(jsonb_build_object('id',e.member_id,'name',coalesce(f.display_name,'عضو')) order by e.member_id),'[]') from marriage.registration_exceptions e left join marriage.profiles f on f.member_id=e.member_id));
end $$;
-- Derive the public registration notice from the lock itself. It has no editable
-- publication, inbox entry, dismissal, or dates that could drift from the phase.
alter function public.wudayn_publications(text,integer,uuid) rename to wudayn_publications_before_registration_phase;
alter function public.wudayn_publications_before_registration_phase(text,integer,uuid) set schema marriage;
revoke all on function marriage.wudayn_publications_before_registration_phase(text,integer,uuid) from public,anon,authenticated,service_role;
create function marriage.phase_publications(platform text,build integer,opened uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare items jsonb; phase marriage.registration_phase;
begin
 items:=marriage.wudayn_publications_before_registration_phase(platform,build,opened);
 select * into phase from marriage.registration_phase;
 if phase.locked and platform in ('ios','web') and build between 1 and 999999 and not marriage.launch_admitted(auth.uid()) then
  items:=items || jsonb_build_array(jsonb_build_object('id',phase.audit_id,'placement','setting','screen','welcome','key','registration.phase',
   'title','التسجيل المبكر مفتوح','body','قدّم طلبك الآن. يفتح الاكتشاف عند الإطلاق.','expires','9999-12-31T00:00:00Z','opened',false));
 end if;
 return items;
end $$;
create function public.wudayn_publications(platform text,build integer,opened uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select marriage.phase_publications($1,$2,$3) $$;
revoke all on function public.wudayn_publications(text,integer,uuid),marriage.phase_publications(text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.wudayn_publications(text,integer,uuid),marriage.phase_publications(text,integer,uuid) to anon,authenticated;
-- Attach a safe event flag to a validated lease. Provider templates own the lock-screen text.
alter function public.nisfayn_push_content(uuid,uuid,boolean) rename to nisfayn_push_content_before_registration_phase;
revoke all on function public.nisfayn_push_content_before_registration_phase(uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function public.nisfayn_push_content(job_id uuid,lease uuid,tester boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare details jsonb:=public.nisfayn_push_content_before_registration_phase(job_id,lease,tester);
begin
 if details is not null and not tester and exists(select from marriage.push_outbox o join marriage.publications p on p.id=o.publication_id
  where o.id=job_id and p.launch_wave is not null) then return details || '{"launch":true}'::jsonb; end if;
 return details;
end $$;
revoke all on function public.nisfayn_push_content(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nisfayn_push_content(uuid,uuid,boolean) to service_role;
create function public.wudayn_launch_alert(subscribe boolean, installation uuid default null) returns boolean language sql security invoker set search_path='' as $$
 select marriage.set_launch_alert($1,$2)
$$;
create function public.wudayn_registration_phase(action text default 'read', expected_revision integer default null, member uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select marriage.registration_phase_admin($1,$2,$3) $$;
revoke all on function marriage.launch_admitted(uuid),marriage.launch_alert_targets(integer),marriage.set_launch_alert(boolean,uuid),
 marriage.registration_phase_admin(text,integer,uuid),public.wudayn_launch_alert(boolean,uuid),
 public.wudayn_registration_phase(text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.set_launch_alert(boolean,uuid),marriage.registration_phase_admin(text,integer,uuid),
 public.wudayn_launch_alert(boolean,uuid),public.wudayn_registration_phase(text,integer,uuid) to authenticated;
