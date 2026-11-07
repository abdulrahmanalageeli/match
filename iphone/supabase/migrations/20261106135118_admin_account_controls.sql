-- Administrative controls use the same checked entrypoints for members and pair testers.
alter table marriage.members add column is_dummy boolean not null default false,
 add column manual_access_until timestamptz, add column admin_revision bigint not null default 0;
create table marriage.admin_test_members (
 id uuid primary key default gen_random_uuid(), actor text not null unique check(actor in('abdulrahman','reham')),
 review_status text not null default 'approved' check(review_status in('draft','pending','approved')),
 suspended boolean not null default false, paused boolean not null default false,
 access_until timestamptz default (now()+interval '365 days'), revision bigint not null default 0,
 created_at timestamptz not null default now()
);
alter table marriage.admin_test_members enable row level security;
revoke all on marriage.admin_test_members from public,anon,authenticated,service_role;
insert into marriage.admin_test_members(actor) values('abdulrahman'),('reham');
create table marriage.admin_test_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references marriage.admin_test_members(id),
 reported_id uuid not null references marriage.admin_test_members(id), reason text not null check(length(btrim(reason)) between 3 and 1000),
 created_at timestamptz not null default now(), resolved_at timestamptz,
 assigned_to uuid references marriage.staff_accounts(user_id) on delete set null, revision bigint not null default 0,
 check(reporter_id<>reported_id), unique(reporter_id,reported_id)
);
alter table marriage.admin_test_reports enable row level security;
revoke all on marriage.admin_test_reports from public,anon,authenticated,service_role;
create index admin_test_reports_assigned on marriage.admin_test_reports(assigned_to) where assigned_to is not null;
create index admin_test_reports_target on marriage.admin_test_reports(reported_id);


alter function marriage.is_paid(uuid) rename to is_paid_before_admin_access;
create function marriage.is_paid(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.is_paid_before_admin_access(target) or exists(select 1 from marriage.members where id=target and manual_access_until>now())
$$;
alter function marriage.member_state(uuid) rename to member_state_before_admin_access;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_admin_access(target); expiry timestamptz;
begin
 select greatest(m.manual_access_until,(result#>>'{membership,expiresAt}')::timestamptz) into expiry from marriage.members m where m.id=target;
 return jsonb_set(result,'{membership}',(result->'membership')||jsonb_build_object('active',marriage.is_paid(target),'expiresAt',expiry,
 'canStart',not marriage.is_paid(target) and coalesce((result#>>'{membership,canStart}')::boolean,false)));
end $$;
alter function marriage.admin_review_revision(uuid) rename to admin_revision_before_controls;
create function marriage.admin_review_revision(target uuid) returns text language sql stable set search_path='' as $$
 select coalesce((select md5(jsonb_build_array(t.review_status,t.suspended,t.paused,t.access_until,t.revision,
  (select data#>array['profiles',t.actor] from nisfayn_test.room where id))::text) from marriage.admin_test_members t where t.id=target),
  (select md5(jsonb_build_array(marriage.admin_revision_before_controls(target),m.is_dummy,m.paused,m.manual_access_until,m.admin_revision,
   p.display_name,p.profession,p.bio)::text) from marriage.members m left join marriage.profiles p on p.member_id=m.id where m.id=target))
$$;
alter function marriage.admin_member_summary(uuid) rename to admin_summary_before_controls;
create function marriage.admin_member_summary(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare t marriage.admin_test_members; p jsonb; result jsonb;
begin
 select * into t from marriage.admin_test_members where id=target;
 if found then
  select coalesce(data#>array['profiles',t.actor],'{}'::jsonb) into p from nisfayn_test.room where id;
  return jsonb_build_object('memberId',t.id,'displayName',coalesce(nullif(p->>'displayName',''),case t.actor when 'reham' then 'رهام' else 'عبدالرحمن' end),
   'age',case when p->>'age' ~ '^[0-9]{1,3}$' then (p->>'age')::int else 29 end,'gender',case t.actor when 'reham' then 'woman' else 'man' end,
   'city',coalesce(p->>'city','الرياض'),'profession',coalesce(p->>'profession','حساب اختبار'),'status',t.review_status,'suspended',t.suspended,
   'submittedAt',t.created_at,'revision',marriage.admin_review_revision(target),'isDummy',true,'paused',t.paused,
   'accessUntil',t.access_until,'accessActive',coalesce(t.access_until>now(),false),'accountSource','pair_test','manualAccessUntil',t.access_until);
 end if;
 result:=marriage.admin_summary_before_controls(target);
 return result||(select jsonb_build_object('isDummy',m.is_dummy,'paused',m.paused,'manualAccessUntil',m.manual_access_until,
 'accessUntil',greatest(m.manual_access_until,(select max(x.expires_at) from marriage.subscription_owners o join marriage.store_transactions x using(original_id) where o.member_id=target and not x.revoked)),
 'accessActive',marriage.is_paid(target),'accountSource','member') from marriage.members m where id=target);
end $$;
create or replace function marriage.admin_applications(status_filter text,before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer','moderator']);
begin
 if status_filter is null or status_filter not in('all','dummy','draft','pending','approved','suspended') then raise exception 'مرشح المراجعة غير صالح.' using errcode='22023';end if;
 if staff.role='moderator' and status_filter<>'suspended' then raise exception 'هذه القائمة لمراجعي العضوية.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(marriage.admin_member_summary(q.id) order by q.id desc) from (
 select a.id from (select m.id,m.review_status,m.suspended,m.is_dummy from marriage.members m join marriage.profiles p on p.member_id=m.id
 union all select t.id,t.review_status,t.suspended,true from marriage.admin_test_members t) a
 where ($2 is null or a.id<$2) and case when $1='all' then true when $1='dummy' then a.is_dummy when $1='suspended' then a.suspended else not a.suspended and a.review_status=$1 end
 order by a.id desc limit 50) q),'[]'::jsonb);
end $$;
alter function marriage.admin_member(uuid) rename to admin_member_before_controls;
create function marriage.admin_member(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer','moderator']);t marriage.admin_test_members;p jsonb;result jsonb;
begin
 select * into t from marriage.admin_test_members where id=target for share;
 if not found then return marriage.admin_member_before_controls(target);end if;
 if staff.role='moderator' and not t.suspended and not exists(select 1 from marriage.admin_test_reports where reported_id=target and resolved_at is null) then raise exception 'يقتصر الاطلاع على الحسابات قيد التحقيق.' using errcode='42501';end if;
 select coalesce(data#>array['profiles',t.actor],'{}'::jsonb) into p from nisfayn_test.room where id;
 result:=marriage.admin_member_summary(target)||jsonb_build_object('bio',coalesce(p->>'bio','حساب اختبار دائم يستخدم مسارات الإدارة نفسها.'),
 'interests',coalesce(p->'interestIds','[]'::jsonb),'familyPreference',coalesce(p->>'familyPreference',''),
 'preferredMinAge',18,'preferredMaxAge',60,'consentVersion',null,'consentedAt',null,'assessmentVersion',coalesce(p->>'assessmentVersion','marriage-v2'),
 'answeredTopics',(select count(*) from jsonb_object_keys(case when jsonb_typeof(p->'surveyAnswers')='object' then p->'surveyAnswers' else '{}'::jsonb end)),'marriageBasics',p->'marriageBasics','publicAvatar',p->'publicAvatar');
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
 values(staff.user_id,staff.display_name,staff.role,'member_viewed','member',target,'Scoped dummy profile review');
 return result;
end $$;

alter function marriage.admin_review(uuid,text,text,text,uuid) rename to admin_review_before_controls;
create function marriage.admin_account_action(target uuid,decision text,changes jsonb,expected_revision text,note text,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer','moderator']);
 t marriage.admin_test_members; m marriage.members; prior marriage.staff_audit; fingerprint text; result jsonb; is_test boolean; days integer; profile jsonb;
begin
 if decision is null or decision not in('approve','suspend','restore','return_pending','pause','resume','edit_profile','grant_access','revoke_access','set_dummy')
 or operation_id is null or expected_revision is null or length(btrim(coalesce(note,''))) not between 3 and 500
 or jsonb_typeof(changes) is distinct from 'object' then raise exception 'أدخل إجراءً وسببًا صالحين وحدّث الملف.' using errcode='22023';end if;
 if target=staff.user_id or (decision in('approve','return_pending') and staff.role not in('owner','reviewer'))
 or (decision in('suspend','restore') and staff.role not in('owner','moderator'))
 or (decision not in('approve','return_pending','suspend','restore') and staff.role<>'owner') then raise exception 'لا تملك صلاحية هذا الإجراء.' using errcode='42501';end if;
 -- Real member review retains the existing consent checks and moderation scope.
 if decision in('approve','suspend','restore') and not exists(select 1 from marriage.admin_test_members where id=target) then
 return marriage.admin_review_before_controls(target,decision,expected_revision,note,operation_id);end if;
 fingerprint:=md5(jsonb_build_array(target,decision,changes,expected_revision,btrim(note))::text);
 perform pg_advisory_xact_lock(hashtextextended(staff.user_id::text||operation_id::text,0));
 select * into prior from marriage.staff_audit where actor_id=staff.user_id and request_id=operation_id;
 if found then
  if prior.action<>decision or prior.request_fingerprint<>fingerprint then raise exception 'أعيد استخدام معرّف إجراء مختلف.' using errcode='22023';end if;
  return prior.result;
 end if;
 select * into t from marriage.admin_test_members where id=target for update;is_test:=found;
 if not is_test then select * into m from marriage.members where id=target for update;
 if not found then raise exception 'الملف غير متاح.' using errcode='P0002';end if;end if;
 if staff.role='moderator' and not t.suspended then
  perform 1 from marriage.admin_test_reports where reported_id=target and resolved_at is null order by id limit 1 for share;
  if not found then raise exception 'يقتصر القرار على الحسابات قيد التحقيق.' using errcode='42501';end if;
 end if;
 if marriage.admin_review_revision(target) is distinct from expected_revision then raise exception 'تغيّر الملف. أعد فتحه قبل اتخاذ القرار.' using errcode='40001';end if;
 if decision='approve' then
  if t.suspended or t.review_status<>'pending' then raise exception 'الطلب غير جاهز للمراجعة.' using errcode='22023';end if;
  update marriage.admin_test_members set review_status='approved' where id=target;
 elsif decision='suspend' then
  if t.suspended then raise exception 'الحساب معلّق بالفعل.' using errcode='22023';end if;
  update marriage.admin_test_members set suspended=true,review_status='pending' where id=target;
 elsif decision='restore' then
  if not t.suspended then raise exception 'الحساب غير معلّق.' using errcode='22023';end if;
  update marriage.admin_test_members set suspended=false,review_status='pending' where id=target;
 elsif decision='return_pending' then
  if is_test then update marriage.admin_test_members set review_status='pending' where id=target;
  else update marriage.members set review_status='pending' where id=target;end if;
 elsif decision in('pause','resume') then
  if is_test then update marriage.admin_test_members set paused=(decision='pause') where id=target;
  else update marriage.members set paused=(decision='pause') where id=target;end if;
 elsif decision='edit_profile' then
  if exists(select 1 from jsonb_object_keys(changes) k where k not in('displayName','profession','bio')) or not changes ?| array['displayName','profession','bio']
  or (changes?'displayName' and (jsonb_typeof(changes->'displayName')<>'string' or length(btrim(changes->>'displayName')) not between 1 and 60))
  or (changes?'profession' and (jsonb_typeof(changes->'profession')<>'string' or length(btrim(changes->>'profession')) not between 1 and 100))
  or (changes?'bio' and (jsonb_typeof(changes->'bio')<>'string' or length(btrim(changes->>'bio')) not between 1 and 1200))
  then raise exception 'بيانات تعديل الملف غير صالحة.' using errcode='22023';end if;
  if is_test then
   update nisfayn_test.room set data=jsonb_set(data,array['profiles',t.actor],coalesce(data#>array['profiles',t.actor],'{}'::jsonb)||changes) where id;
  else update marriage.profiles set display_name=coalesce(btrim(changes->>'displayName'),display_name),profession=coalesce(btrim(changes->>'profession'),profession),bio=coalesce(btrim(changes->>'bio'),bio) where member_id=target;
   if not found then raise exception 'الملف غير متاح.' using errcode='P0002';end if;
  end if;
 elsif decision='grant_access' then
  if changes->>'days' is null or changes->>'days' !~ '^[0-9]{1,3}$' then raise exception 'حدد مدة من يوم إلى ٣٦٥ يومًا.' using errcode='22023';end if;
  days:=(changes->>'days')::integer;
  if days not between 1 and 365 then raise exception 'حدد مدة من يوم إلى ٣٦٥ يومًا.' using errcode='22023';end if;
  if is_test then update marriage.admin_test_members set access_until=now()+make_interval(days=>days) where id=target;
  else update marriage.members set manual_access_until=now()+make_interval(days=>days) where id=target;end if;
 elsif decision='revoke_access' then
  if is_test then update marriage.admin_test_members set access_until=null where id=target;
  else update marriage.members set manual_access_until=null where id=target;end if;
 elsif decision='set_dummy' then
  if jsonb_typeof(changes->'isDummy') is distinct from 'boolean' or (is_test and changes->'isDummy'='false'::jsonb) then raise exception 'لا يمكن إخفاء وسم حساب الاختبار.' using errcode='22023';end if;
  if not is_test then update marriage.members set is_dummy=(changes->>'isDummy')::boolean where id=target;end if;
 end if;
 if is_test then
  update marriage.admin_test_members set revision=revision+1 where id=target;
  if decision in('suspend','return_pending','pause','revoke_access') then
   update nisfayn_test.room set data=data||jsonb_build_object('matched',false,'call',case when jsonb_typeof(data->'call')='object' then (data->'call')||jsonb_build_object('status','ended','endedAt',now(),'endReason','unavailable') else 'null'::jsonb end) where id;
  end if;
 else
  update marriage.members set admin_revision=admin_revision+1 where id=target;
  if decision='return_pending' then
   update marriage.member_requests set status='closed',updated_at=now() where target in(requester_id,recipient_id) and status in('pending','accepted');
   update marriage.introductions set closed_at=now() where closed_at is null and target in(member_a,member_b);
  end if;
 end if;
 result:=jsonb_build_object('ok',true,'action',decision,'memberId',target);
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
 values(staff.user_id,staff.display_name,staff.role,decision,'member',target,btrim(note),operation_id,fingerprint,result);
 return result;
end $$;
create function marriage.admin_review(target uuid,decision text,expected_revision text,note text,operation_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_account_action($1,$2,'{}'::jsonb,$3,$4,$5)$$;
create function public.marriage_admin_manage(member_id uuid,action text,changes jsonb,expected_revision text,reason text,request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_account_action($1,$2,$3,$4,$5,$6)$$;

-- All pair operations including media authorization and call tokens pass this gate.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_admin_controls;
revoke all on function nisfayn_test.rpc_before_admin_controls(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;account marriage.admin_test_members;result jsonb;profile_name text;
begin
 if action in('attempt','logout') then return nisfayn_test.rpc_before_admin_controls(action,session_token,payload);end if;
 if action='login' then who:=payload->>'actor';else select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();end if;
 if action='profile' then select * into account from marriage.admin_test_members where actor=who for update;
 else select * into account from marriage.admin_test_members where actor=who for share;end if;
 if not found or account.suspended or account.paused or account.review_status<>'approved' or coalesce(account.access_until<=now(),true) then
 raise exception 'الحساب غير متاح حاليًا. راجع الإدارة.' using errcode='42501';end if;
 if action not in('login','state','profile','close','gallery_list','gallery_prepare','gallery_commit','gallery_remove') then
  perform 1 from marriage.admin_test_members where actor<>who and not suspended and not paused and review_status='approved' and access_until>now() for share;
  if not found then raise exception 'الطرف الآخر غير متاح حاليًا.' using errcode='42501';end if;
 end if;
 if action='profile' and marriage.admin_review_revision(account.id) is distinct from payload->>'expectedRevision' then
 raise exception 'تغيّر الملف. أعد تحميله قبل الحفظ.' using errcode='40001';end if;
 if action='profile' then
  select coalesce(payload#>>'{profile,displayName}',data#>>array['profiles',who,'displayName']) into profile_name from nisfayn_test.room where id;
  if profile_name is not null and length(btrim(profile_name)) not between 1 and 60 then raise exception 'الاسم غير صالح.' using errcode='22023';end if;
 end if;
 if action='close' and payload->'report'='true'::jsonb then
  if length(btrim(coalesce(payload->>'reason',''))) not between 3 and 1000 then raise exception 'اكتب سبب البلاغ من ٣ إلى ١٠٠٠ حرف.' using errcode='22023';end if;
  insert into marriage.admin_test_reports(reporter_id,reported_id,reason)
   select account.id,t.id,btrim(payload->>'reason') from marriage.admin_test_members t where t.actor<>who
   on conflict(reporter_id,reported_id) do update set reason=excluded.reason,resolved_at=null,assigned_to=null,revision=marriage.admin_test_reports.revision+1
   where marriage.admin_test_reports.reason is distinct from excluded.reason or marriage.admin_test_reports.resolved_at is not null;
 end if;
 result:=nisfayn_test.rpc_before_admin_controls(action,session_token,payload);
 if action='profile' and profile_name is not null then
  update nisfayn_test.room set data=jsonb_set(data,array['profiles',who,'displayName'],to_jsonb(btrim(profile_name))) where id returning data||jsonb_build_object('actor',who) into result;
 end if;
 if jsonb_typeof(result)='object' and (result?'profiles' or action='login') then result:=result||jsonb_build_object('profileRevision',marriage.admin_review_revision(account.id));end if;
 return result;
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;

alter function marriage.admin_overview() rename to admin_overview_before_controls;
create function marriage.admin_overview() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=marriage.admin_overview_before_controls();counts jsonb;
begin
 counts:=result->'counts';
 return jsonb_set(result,'{counts}',counts||jsonb_build_object(
 'totalMembers',(counts->>'totalMembers')::int+(select count(*) from marriage.admin_test_members),
 'pendingApplications',(counts->>'pendingApplications')::int+(select count(*) from marriage.admin_test_members where review_status='pending' and not suspended),
 'approvedMembers',(counts->>'approvedMembers')::int+(select count(*) from marriage.admin_test_members where review_status='approved' and not suspended),
 'suspendedMembers',(counts->>'suspendedMembers')::int+(select count(*) from marriage.admin_test_members where suspended)));
end $$;
-- Explicitly expose only staff-gated entrypoints; helpers and historical versions stay private.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='marriage' and p.proname in('admin_test_members','is_paid','is_paid_before_admin_access','member_state','member_state_before_admin_access',
 'admin_review_revision','admin_revision_before_controls','admin_member_summary','admin_summary_before_controls','admin_member','admin_member_before_controls',
 'admin_review','admin_review_before_controls','admin_account_action','admin_overview','admin_overview_before_controls')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;
revoke all on function public.marriage_admin_manage(uuid,text,jsonb,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.admin_member(uuid),marriage.admin_review(uuid,text,text,text,uuid),marriage.admin_account_action(uuid,text,jsonb,text,text,uuid),
 marriage.admin_overview(),public.marriage_admin_manage(uuid,text,jsonb,text,text,uuid) to authenticated;

-- Reports from dummy members use the same review queue and safeguards as member reports.
alter function marriage.admin_report_revision(uuid) rename to admin_report_revision_before_testers;
create function marriage.admin_report_revision(target uuid) returns text language sql stable set search_path='' as $$
 select coalesce((select md5(jsonb_build_array(r.reason,r.resolved_at,r.assigned_to,r.revision)::text) from marriage.admin_test_reports r where r.id=target),
 marriage.admin_report_revision_before_testers(target))
$$;
alter function marriage.admin_reports(text,uuid) rename to admin_reports_before_testers;
create function marriage.admin_reports(status_filter text,before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=marriage.admin_reports_before_testers(status_filter,before_id); testers jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('reportId',r.id,'reportedId',r.reported_id,
 'reportedName',marriage.admin_member_summary(r.reported_id)->>'displayName','reason',r.reason,'createdAt',r.created_at,
 'resolvedAt',r.resolved_at,'assignedTo',r.assigned_to,'assignedName',s.display_name,'revision',marriage.admin_report_revision(r.id),'isDummy',true) order by r.id desc),'[]'::jsonb)
 into testers from marriage.admin_test_reports r left join marriage.staff_accounts s on s.user_id=r.assigned_to
 where (before_id is null or r.id<before_id) and ((status_filter='open')=(r.resolved_at is null));
 return (select coalesce(jsonb_agg(q.value order by (q.value->>'reportId')::uuid desc),'[]'::jsonb) from
 (select value from jsonb_array_elements(result||testers) order by (value->>'reportId')::uuid desc limit 50) q);
end $$;
alter function marriage.admin_report_action(uuid,text,text,text,uuid) rename to admin_report_action_before_testers;
create function marriage.admin_report_action(target uuid,decision text,expected_revision text,note text,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','moderator']);r marriage.admin_test_reports; prior marriage.staff_audit;fingerprint text;result jsonb;
begin
 if not exists(select 1 from marriage.admin_test_reports where id=target) then return marriage.admin_report_action_before_testers(target,decision,expected_revision,note,operation_id);end if;
 if decision is null or decision not in('assign_self','resolve','reopen') or operation_id is null or expected_revision is null
 or length(btrim(coalesce(note,''))) not between 3 and 500 then raise exception 'أدخل إجراءً وسببًا صالحين وحدّث البلاغ.' using errcode='22023';end if;
 fingerprint:=md5(jsonb_build_array(target,decision,expected_revision,btrim(note))::text);
 perform pg_advisory_xact_lock(hashtextextended(staff.user_id::text||operation_id::text,0));
 select * into prior from marriage.staff_audit where actor_id=staff.user_id and request_id=operation_id;
 if found then
  if prior.action<>decision or prior.request_fingerprint<>fingerprint then raise exception 'أعيد استخدام معرّف إجراء مختلف.' using errcode='22023';end if;
  return prior.result;
 end if;
 select * into r from marriage.admin_test_reports where id=target for update;
 if marriage.admin_report_revision(target) is distinct from expected_revision then raise exception 'تغيّر البلاغ. حدّث القائمة قبل المتابعة.' using errcode='40001';end if;
 if r.assigned_to is not null and r.assigned_to<>staff.user_id and staff.role<>'owner' then raise exception 'البلاغ مسند إلى مراجع آخر.' using errcode='42501';end if;
 if decision in('assign_self','resolve') and r.resolved_at is not null then raise exception 'البلاغ مغلق بالفعل.' using errcode='22023';end if;
 if decision='reopen' and r.resolved_at is null then raise exception 'البلاغ مفتوح بالفعل.' using errcode='22023';end if;
 update marriage.admin_test_reports set assigned_to=staff.user_id,revision=revision+1,
 resolved_at=case when decision='resolve' then now() when decision='reopen' then null else resolved_at end where id=target;
 result:=jsonb_build_object('ok',true,'action',decision,'reportId',target);
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
 values(staff.user_id,staff.display_name,staff.role,decision,'report',target,btrim(note),operation_id,fingerprint,result);
 return result;
end $$;
-- Include actual dummy report counts without fabricating production events.
create or replace function marriage.admin_overview() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=marriage.admin_overview_before_controls();counts jsonb;
begin
 counts:=result->'counts';
 return jsonb_set(result,'{counts}',counts||jsonb_build_object(
 'totalMembers',(counts->>'totalMembers')::int+(select count(*) from marriage.admin_test_members),
 'openReports',(counts->>'openReports')::int+(select count(*) from marriage.admin_test_reports where resolved_at is null),
 'pendingApplications',(counts->>'pendingApplications')::int+(select count(*) from marriage.admin_test_members where review_status='pending' and not suspended),
 'approvedMembers',(counts->>'approvedMembers')::int+(select count(*) from marriage.admin_test_members where review_status='approved' and not suspended),
 'suspendedMembers',(counts->>'suspendedMembers')::int+(select count(*) from marriage.admin_test_members where suspended)));
end $$;
revoke all on function marriage.admin_report_revision(uuid),marriage.admin_report_revision_before_testers(uuid),
 marriage.admin_reports(text,uuid),marriage.admin_reports_before_testers(text,uuid),
 marriage.admin_report_action(uuid,text,text,text,uuid),marriage.admin_report_action_before_testers(uuid,text,text,text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function marriage.admin_reports(text,uuid),marriage.admin_report_action(uuid,text,text,text,uuid) to authenticated;
