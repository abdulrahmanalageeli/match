-- Hold only the selected incoming message. Never retain attachment bytes or storage URLs.
create table marriage.report_evidence (
 report_id uuid primary key references marriage.reports on delete cascade,
 message_id uuid not null, sent_at timestamptz not null, excerpt text, kind text,
 expires_at timestamptz not null default (now()+interval '30 days')
);
alter table marriage.report_evidence enable row level security;
revoke all on marriage.report_evidence from public,anon,authenticated,service_role;
alter table marriage.reports add column submission_id uuid;
create unique index report_submission on marriage.reports(member_id,submission_id) where submission_id is not null;

create function marriage.report_incident(request_id uuid,message_id uuid,reason text,submission_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); peer uuid; report uuid; m marriage.thread_messages;
begin
 if submission_id is null or length(btrim(coalesce(reason,''))) not between 3 and 500 then
  raise exception 'اختر سبب البلاغ.' using errcode='22023'; end if;
 select case when requester_id=me then recipient_id else requester_id end into peer
 from marriage.member_requests where id=$1 and me in(requester_id,recipient_id);
 if peer is null then raise exception 'الطلب غير متاح.' using errcode='42501'; end if;
 perform marriage.lock_member_pair(me,peer);
 select id into report from marriage.reports r where r.member_id=me and r.submission_id=$4;
 if found then
  if not exists(select 1 from marriage.reports r where r.id=report and r.reported_id=peer and r.reason=btrim($3)) then
   raise exception 'أعيد استخدام معرّف بلاغ مختلف.' using errcode='22023';
  end if;
  return report;
 end if;
 if message_id is not null then
  select * into m from marriage.thread_messages t where t.id=$2 and t.request_id=$1 and t.sender_id=peer for share;
  if not found then raise exception 'الرسالة غير متاحة.' using errcode='42501'; end if;
 end if;
 insert into marriage.reports(member_id,reported_id,reason,submission_id) values(me,peer,btrim($3),$4) returning id into report;
 if message_id is not null then
  insert into marriage.report_evidence(report_id,message_id,sent_at,excerpt,kind)
  select report,m.id,m.created_at,case when m.deleted_at is null then m.body end,
   (select c.kind from marriage.chat_media c where c.id=m.id);
 end if;
 insert into marriage.blocks(member_id,blocked_id) values(me,peer) on conflict do nothing;
 return report;
end $$;
create function public.marriage_report_incident(request_id uuid,message_id uuid,reason text,submission_id uuid) returns uuid
language sql security invoker set search_path='' as $$select marriage.report_incident($1,$2,$3,$4)$$;
revoke all on function marriage.report_incident(uuid,uuid,text,uuid),public.marriage_report_incident(uuid,uuid,text,uuid) from public,anon;
grant execute on function marriage.report_incident(uuid,uuid,text,uuid),public.marriage_report_incident(uuid,uuid,text,uuid) to authenticated;

-- Staff already have case-level access. Evidence is released only on assignment (or to an owner).
create function marriage.report_excerpt(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','moderator']); result jsonb;
begin
 if staff.role<>'owner' and not exists(select 1 from marriage.report_reviews r where r.report_id=target and assigned_to=staff.user_id) then
  raise exception 'يلزم إسناد البلاغ إليك.' using errcode='42501'; end if;
 select jsonb_build_object('body',excerpt,'kind',kind,'sentAt',sent_at,'expiresAt',expires_at)
 into result from marriage.report_evidence where report_id=target and expires_at>now();
 if result is not null then
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,result)
  values(staff.user_id,staff.display_name,staff.role,'view_evidence','report',target,'مراجعة الرسالة المرفقة بالبلاغ','{}');
 end if;
 return result;
end $$;
create function public.marriage_report_excerpt(target uuid) returns jsonb language sql security invoker set search_path='' as $$select marriage.report_excerpt($1)$$;
revoke all on function marriage.report_excerpt(uuid),public.marriage_report_excerpt(uuid) from public,anon;
grant execute on function marriage.report_excerpt(uuid),public.marriage_report_excerpt(uuid) to authenticated;

-- Queue imminent threats ahead of other open cases, retaining the existing UUID cursor within each tier.
create or replace function marriage.admin_reports(status_filter text,before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform marriage.require_staff(array['owner','moderator']);
 if status_filter is null or status_filter not in ('open','resolved') then raise exception 'مرشح غير صالح'; end if;
 with cases as (
  select r.id,r.reported_id,r.reason,r.created_at,r.resolved_at,rv.assigned_to,false as dummy from marriage.reports r
  left join marriage.report_reviews rv on rv.report_id=r.id where (r.resolved_at is null)=(status_filter='open')
  union all
  select r.id,r.reported_id,r.reason,r.created_at,r.resolved_at,r.assigned_to,true from marriage.admin_test_reports r
  where (r.resolved_at is null)=(status_filter='open')
 ), ranked as (
  select c.*,(c.reason like 'تهديد فوري%' and c.resolved_at is null)::int as priority from cases c
 ), page as (
  select * from ranked where before_id is null or (priority,id)<(coalesce((select priority from ranked where id=before_id),0),before_id)
  order by priority desc,id desc limit 50
 )
 select coalesce(jsonb_agg(jsonb_build_object('reportId',p.id,'reportedId',p.reported_id,'reason',p.reason,
  'reportedName',case when p.dummy then marriage.admin_member_summary(p.reported_id)->>'displayName' else pr.display_name end,
  'createdAt',p.created_at,'resolvedAt',p.resolved_at,'assignedTo',p.assigned_to,'assignedName',s.display_name,
  'isDummy',p.dummy,'urgent',p.priority=1,'hasEvidence',exists(select 1 from marriage.report_evidence e where e.report_id=p.id and e.expires_at>now()),
  'revision',marriage.admin_report_revision(p.id)) order by p.priority desc,p.id desc),'[]')
 into result from page p left join marriage.profiles pr on pr.member_id=p.reported_id left join marriage.staff_accounts s on s.user_id=p.assigned_to;
 return result;
end $$;

-- Show reviewers a coarse repeat-registration signal only for links to a suspended account.
-- A verified phone match or shared device is a review clue, never an automatic sanction.
create function marriage.repeat_registration(target uuid) returns boolean language sql stable set search_path='' as $$
 select exists(
 select 1 from marriage.signup_phone_verifications a join marriage.signup_phone_verifications b on a.phone=b.phone and a.user_id<>b.user_id
 join marriage.members m on m.id=b.user_id and m.suspended where a.user_id=target
 ) or exists(
 select 1 from marriage.registration_devices a join marriage.registration_devices b on a.device_hash=b.device_hash and a.user_id<>b.user_id
 join marriage.members m on m.id=b.user_id and m.suspended where a.user_id=target)
$$;
revoke all on function marriage.repeat_registration(uuid) from public,anon,authenticated;

alter function marriage.admin_member(uuid) rename to admin_member_before_repeat_review;
revoke all on function marriage.admin_member_before_repeat_review(uuid) from public,anon,authenticated;
create function marriage.admin_member(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=marriage.admin_member_before_repeat_review(target);
begin
 return result||jsonb_build_object('repeatReview', marriage.repeat_registration(target));
end $$;
revoke all on function marriage.admin_member(uuid) from public,anon;
grant execute on function marriage.admin_member(uuid) to authenticated;

-- Give membership reviewers a queue without exposing the shared phone or device.
alter function marriage.admin_applications(text,uuid) rename to admin_applications_before_repeat_review;
revoke all on function marriage.admin_applications_before_repeat_review(text,uuid) from public,anon,authenticated;
create function marriage.admin_applications(status_filter text,before_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if status_filter is distinct from 'repeat_review' then return marriage.admin_applications_before_repeat_review(status_filter,before_id); end if;
 perform marriage.require_staff(array['owner','reviewer']);
 return (select coalesce(jsonb_agg(marriage.admin_member_summary(q.id) order by q.id desc),'[]') from (
  select m.id from marriage.members m join marriage.profiles p on p.member_id=m.id
  where not m.suspended and (before_id is null or m.id<before_id) and marriage.repeat_registration(m.id)
  order by m.id desc limit 50) q);
end $$;
revoke all on function marriage.admin_applications(text,uuid) from public,anon;
grant execute on function marriage.admin_applications(text,uuid) to authenticated;

alter function marriage.operations_cleanup() rename to operations_cleanup_before_safety;
revoke all on function marriage.operations_cleanup_before_safety() from public,anon,authenticated,service_role;
create function marriage.operations_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=marriage.operations_cleanup_before_safety();
begin
 delete from marriage.report_evidence where expires_at<=now();
 delete from marriage.safety_usage where window_start<now()-interval '2 days';
 return result;
end $$;
revoke all on function marriage.operations_cleanup() from public,anon,authenticated;
grant execute on function marriage.operations_cleanup() to service_role;

