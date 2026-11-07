-- Staff authority is provisioned only by a trusted database operator. A member
-- profile, client metadata, an email domain, or an MFA login alone grants none.
create table marriage.staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','reviewer','moderator')),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table marriage.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check(email=lower(btrim(email)) and length(email) between 3 and 254),
  role text not null check(role in ('owner','reviewer','moderator')),
  display_name text not null check(length(btrim(display_name)) between 1 and 80),
  expires_at timestamptz not null,
  active boolean not null default true,
  claimed_by uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  check((claimed_by is null)=(claimed_at is null))
);
create table marriage.staff_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  target_type text not null check(target_type in ('member','report','staff','staff_invitation')),
  target_id uuid not null,
  reason text not null check(length(reason) between 3 and 500),
  request_id uuid,
  request_fingerprint text,
  result jsonb,
  created_at timestamptz not null default now(),
  unique(actor_id,request_id)
);
-- Audit identifiers intentionally have no cascading foreign keys. Account
-- deletion cannot erase staff decision history; do not put profile/chat text here.
create index staff_audit_target on marriage.staff_audit(target_type,target_id,id desc);
create index staff_audit_actor on marriage.staff_audit(actor_id,id desc);
create table marriage.report_reviews (
  report_id uuid primary key references marriage.reports(id) on delete cascade,
  assigned_to uuid references marriage.staff_accounts(user_id) on delete set null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index report_reviews_assignee on marriage.report_reviews(assigned_to) where assigned_to is not null;
create index reports_open_queue on marriage.reports(id desc) where resolved_at is null;
create index members_review_queue on marriage.members(review_status,id desc) where not suspended;

alter table marriage.staff_accounts enable row level security;
alter table marriage.staff_invitations enable row level security;
alter table marriage.staff_audit enable row level security;
alter table marriage.report_reviews enable row level security;
revoke all on marriage.staff_accounts,marriage.staff_invitations,marriage.staff_audit,marriage.report_reviews from public,anon,authenticated,service_role;
revoke all on sequence marriage.staff_audit_id_seq from public,anon,authenticated,service_role;

create function marriage.immutable_staff_audit() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'سجل الإجراءات غير قابل للتعديل.' using errcode='42501'; end $$;
create trigger staff_audit_append_only before update or delete on marriage.staff_audit
for each row execute function marriage.immutable_staff_audit();

create function marriage.audit_staff_provisioning() returns trigger
language plpgsql security definer set search_path='' as $$
declare target marriage.staff_accounts;
begin
  target:=case when tg_op='DELETE' then old else new end;
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
    values(null,'Trusted database operator','database',case when tg_op='INSERT' then 'staff_granted'
      when tg_op='DELETE' then 'staff_removed' else 'staff_changed' end,'staff',target.user_id,
      'Trusted provisioning: '||target.role||'; active='||target.active::text);
  return target;
end $$;
create trigger audit_staff_authority after insert or update or delete on marriage.staff_accounts
for each row execute function marriage.audit_staff_provisioning();

create function marriage.audit_staff_invitation() returns trigger
language plpgsql security definer set search_path='' as $$
declare target marriage.staff_invitations;
begin
  target:=case when tg_op='DELETE' then old else new end;
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
    values(case when tg_op='UPDATE' and new.claimed_at is not null and old.claimed_at is null then new.claimed_by else null end,
      case when tg_op='UPDATE' and new.claimed_at is not null and old.claimed_at is null then target.display_name else 'Trusted database operator' end,
      'invitation',case when tg_op='INSERT' then 'staff_invited' when tg_op='DELETE' then 'staff_invitation_removed'
        when new.claimed_at is not null and old.claimed_at is null then 'staff_invitation_claimed' else 'staff_invitation_changed' end,
      'staff_invitation',target.id,'Reserved staff role: '||target.role);
  return target;
end $$;
create trigger audit_staff_reservations after insert or update or delete on marriage.staff_invitations
for each row execute function marriage.audit_staff_invitation();

create function marriage.staff_identity() returns uuid
language plpgsql set search_path='' as $$
declare me uuid:=auth.uid(); session_id uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  -- Keep this independent of paid member eligibility: staff need neither a
  -- discoverable profile nor a subscription. Revoked sessions fail immediately.
  perform 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=session_id and s.user_id=me and (s.not_after is null or s.not_after>now())
      and ((nullif(u.email,'') is not null and u.email_confirmed_at is not null)
        or (nullif(u.phone,'') is not null and u.phone_confirmed_at is not null))
    for share of s;
  if not found then raise exception 'يلزم تسجيل الدخول بحساب مؤكد.' using errcode='42501'; end if;
  return me;
end $$;

create function marriage.require_staff(allowed text[]) returns marriage.staff_accounts
language plpgsql set search_path='' as $$
declare me uuid:=marriage.staff_identity(); staff marriage.staff_accounts;
begin
  select * into staff from marriage.staff_accounts where user_id=me and active for share;
  if not found or not(staff.role=any(allowed)) then
    raise exception 'لا تملك صلاحية هذا الإجراء.' using errcode='42501';
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then
    raise exception 'أكمل التحقق بخطوتين للمتابعة.' using errcode='42501';
  end if;
  return staff;
end $$;

create function marriage.admin_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.staff_identity(); staff marriage.staff_accounts; invitation marriage.staff_invitations;
begin
  select * into staff from marriage.staff_accounts where user_id=me for share;
  if not found then
    -- The invitation is inserted only by a trusted operator. Compare the live
    -- Auth record, never JWT email/user_metadata, and never claim an unconfirmed email.
    select i.* into invitation from marriage.staff_invitations i join auth.users u on u.id=me
      where u.email_confirmed_at is not null and i.email=lower(u.email) and i.active
        and i.expires_at>now() and i.claimed_at is null for update of i;
    if found then
      insert into marriage.staff_accounts(user_id,role,display_name)
        values(me,invitation.role,invitation.display_name) on conflict(user_id) do nothing;
      update marriage.staff_invitations set claimed_by=me,claimed_at=now() where id=invitation.id;
      select * into staff from marriage.staff_accounts where user_id=me for share;
    end if;
  end if;
  return jsonb_build_object('authorized',coalesce(staff.active,false),'userId',me,
    'role',case when staff.active then staff.role else null end,
    'displayName',case when staff.active then staff.display_name else null end,
    'mfaRequired',coalesce(staff.active,false) and (auth.jwt()->>'aal' is distinct from 'aal2'));
end $$;

create function marriage.admin_review_revision(target uuid) returns text
language sql stable set search_path='' as $$
  select md5(jsonb_build_array(m.review_status,m.suspended,
    (select max(r.id) from marriage.reviews r where r.member_id=m.id))::text)
  from marriage.members m where m.id=target
$$;

create function marriage.admin_member_summary(target uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('memberId',m.id,'displayName',p.display_name,'age',p.age,'gender',p.gender,
    'city',c.label,'profession',p.profession,'status',m.review_status,'suspended',m.suspended,
    'submittedAt',(select max(r.recorded_at) from marriage.reviews r where r.member_id=m.id and r.action='submit'),
    'revision',marriage.admin_review_revision(m.id))
  from marriage.members m join marriage.profiles p on p.member_id=m.id join marriage.cities c on c.id=p.city_id
  where m.id=target
$$;

create function marriage.admin_overview() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform marriage.require_staff(array['owner','reviewer','moderator']);
  return jsonb_build_object('counts',jsonb_build_object(
    'pendingApplications',(select count(*) from marriage.members where review_status='pending' and not suspended),
    'openReports',(select count(*) from marriage.reports where resolved_at is null),
    'suspendedMembers',(select count(*) from marriage.members where suspended),
    'approvedMembers',(select count(*) from marriage.members where review_status='approved' and not suspended),
    'totalMembers',(select count(*) from marriage.members)),
    'daily',coalesce((select jsonb_agg(to_jsonb(p)) from marriage.pilot_totals() p),'[]'::jsonb),
    'cohorts',coalesce((select jsonb_agg(to_jsonb(c)) from marriage.fit_cohorts() c),'[]'::jsonb));
end $$;

create function marriage.admin_applications(status_filter text,before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer','moderator']);
begin
  if status_filter not in ('pending','approved','suspended') or status_filter is null then
    raise exception 'مرشح المراجعة غير صالح.' using errcode='22023';
  end if;
  if staff.role='moderator' and status_filter<>'suspended' then
    raise exception 'هذه القائمة لمراجعي العضوية.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(marriage.admin_member_summary(q.id) order by q.id desc) from (
    select m.id from marriage.members m join marriage.profiles p on p.member_id=m.id
    where (before_id is null or m.id<before_id)
      and case when status_filter='suspended' then m.suspended else not m.suspended and m.review_status=status_filter end
    order by m.id desc limit 50) q),'[]'::jsonb);
end $$;

create function marriage.admin_member(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer','moderator']); result jsonb;
begin
  if staff.role='moderator' and not exists(select 1 from marriage.reports where reported_id=target and resolved_at is null)
      and not exists(select 1 from marriage.members where id=target and suspended) then
    raise exception 'يقتصر الاطلاع على الحسابات قيد التحقيق.' using errcode='42501';
  end if;
  -- Profile submissions acquire the same member lock before updating related
  -- fields. Hold a shared lock so this review detail and its revision agree.
  perform 1 from marriage.members where id=target for share;
  result:=marriage.admin_member_summary(target);
  if result is null then raise exception 'الملف غير متاح.' using errcode='P0002'; end if;
  result:=result||jsonb_build_object(
    'bio',(select bio from marriage.profiles where member_id=target),
    'interests',coalesce((select jsonb_agg(i.label order by i.position) from marriage.member_interests mi
      join marriage.interests i on i.code=mi.interest_code where mi.member_id=target),'[]'::jsonb),
    'familyPreference',(select family_preference from marriage.preferences where member_id=target),
    'preferredMinAge',(select min_age from marriage.preferences where member_id=target),
    'preferredMaxAge',(select max_age from marriage.preferences where member_id=target),
    'consentVersion',(select version from marriage.consents where member_id=target order by id desc limit 1),
    'consentedAt',(select recorded_at from marriage.consents where member_id=target order by id desc limit 1),
    'assessmentVersion',coalesce((select version from marriage.member_assessment where member_id=target),'legacy-v0'),
    'answeredTopics',(select count(*) from marriage.member_answers where member_id=target));
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
    values(staff.user_id,staff.display_name,staff.role,'member_viewed','member',target,'Scoped profile review');
  return result;
end $$;

create function marriage.admin_review(target uuid,decision text,expected_revision text,note text,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer','moderator']);
  current_member marriage.members; prior marriage.staff_audit; fingerprint text; result jsonb;
begin
  if decision is null or decision not in ('approve','suspend','restore') or operation_id is null
    or length(btrim(coalesce(note,''))) not between 3 and 500 or expected_revision is null then
    raise exception 'أدخل قرارًا وسببًا صالحين وحدّث الملف قبل المراجعة.' using errcode='22023';
  end if;
  if (decision='approve' and staff.role not in ('owner','reviewer'))
    or (decision in ('suspend','restore') and staff.role not in ('owner','moderator')) or target=staff.user_id then
    raise exception 'لا تملك صلاحية هذا القرار.' using errcode='42501';
  end if;
  fingerprint:=md5(jsonb_build_array(target,decision,expected_revision,btrim(note))::text);
  perform pg_advisory_xact_lock(hashtextextended(staff.user_id::text||operation_id::text,0));
  select * into prior from marriage.staff_audit where actor_id=staff.user_id and request_id=operation_id;
  if found then
    if prior.action<>decision or prior.request_fingerprint<>fingerprint then
      raise exception 'أعيد استخدام معرّف إجراء مختلف.' using errcode='22023';
    end if;
    return prior.result;
  end if;
  select * into current_member from marriage.members where id=target for update;
  if not found then raise exception 'الملف غير متاح.' using errcode='P0002'; end if;
  if staff.role='moderator' and not current_member.suspended then
    -- Scope moderation to an active investigation and keep it open until this
    -- decision commits. Knowing a member ID/revision is not authorization.
    perform 1 from marriage.reports where reported_id=target and resolved_at is null
      order by id limit 1 for share;
    if not found then
      raise exception 'يقتصر القرار على الحسابات قيد التحقيق.' using errcode='42501';
    end if;
  end if;
  if marriage.admin_review_revision(target) is distinct from expected_revision then
    raise exception 'تغيّر الملف. أعد فتحه قبل اتخاذ القرار.' using errcode='40001';
  end if;
  case decision
    when 'approve' then
      if current_member.suspended then raise exception 'يلزم رفع التعليق أولًا.' using errcode='22023'; end if;
      perform marriage.review_member(target,'approve');
    when 'suspend' then
      if current_member.suspended then raise exception 'الحساب معلّق بالفعل.' using errcode='22023'; end if;
      perform marriage.review_member(target,'suspend');
      update marriage.member_requests set status='closed',updated_at=now()
        where target in(requester_id,recipient_id) and status in ('pending','accepted');
    when 'restore' then
      if not current_member.suspended then raise exception 'الحساب غير معلّق.' using errcode='22023'; end if;
      update marriage.members set suspended=false,
        review_status=case when review_status='draft' then 'draft' else 'pending' end where id=target;
      -- Restoring access never reopens prior conversations or skips profile review.
  end case;
  result:=jsonb_build_object('ok',true,'action',decision,'memberId',target);
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
    values(staff.user_id,staff.display_name,staff.role,decision,'member',target,btrim(note),operation_id,fingerprint,result);
  return result;
end $$;

create function marriage.admin_report_revision(target uuid) returns text
language sql stable set search_path='' as $$
  select md5(jsonb_build_array(r.reason,r.resolved_at,meta.assigned_to,coalesce(meta.revision,0))::text)
  from marriage.reports r left join marriage.report_reviews meta on meta.report_id=r.id where r.id=target
$$;

create function marriage.admin_reports(status_filter text,before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform marriage.require_staff(array['owner','moderator']);
  if status_filter is null or status_filter not in ('open','resolved') then
    raise exception 'مرشح البلاغات غير صالح.' using errcode='22023';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('reportId',q.id,'reportedId',q.reported_id,
    'reportedName',q.display_name,'reason',q.reason,'createdAt',q.created_at,'resolvedAt',q.resolved_at,
    'assignedTo',q.assigned_to,'assignedName',q.assigned_name,'revision',marriage.admin_report_revision(q.id)) order by q.id desc)
    from (select r.*,p.display_name,meta.assigned_to,s.display_name as assigned_name from marriage.reports r
      left join marriage.profiles p on p.member_id=r.reported_id
      left join marriage.report_reviews meta on meta.report_id=r.id
      left join marriage.staff_accounts s on s.user_id=meta.assigned_to
      where (before_id is null or r.id<before_id) and ((status_filter='open')=(r.resolved_at is null))
      order by r.id desc limit 50) q),'[]'::jsonb);
end $$;

create function marriage.admin_report_action(target uuid,decision text,expected_revision text,note text,operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','moderator']);
  report marriage.reports; review marriage.report_reviews; prior marriage.staff_audit; fingerprint text; result jsonb;
begin
  if decision is null or decision not in ('assign_self','resolve','reopen') or operation_id is null
    or length(btrim(coalesce(note,''))) not between 3 and 500 or expected_revision is null then
    raise exception 'أدخل إجراءً وسببًا صالحين وحدّث البلاغ.' using errcode='22023';
  end if;
  fingerprint:=md5(jsonb_build_array(target,decision,expected_revision,btrim(note))::text);
  perform pg_advisory_xact_lock(hashtextextended(staff.user_id::text||operation_id::text,0));
  select * into prior from marriage.staff_audit where actor_id=staff.user_id and request_id=operation_id;
  if found then
    if prior.action<>decision or prior.request_fingerprint<>fingerprint then
      raise exception 'أعيد استخدام معرّف إجراء مختلف.' using errcode='22023';
    end if;
    return prior.result;
  end if;
  select * into report from marriage.reports where id=target for update;
  if not found then raise exception 'البلاغ غير متاح.' using errcode='P0002'; end if;
  if marriage.admin_report_revision(target) is distinct from expected_revision then
    raise exception 'تغيّر البلاغ. حدّث القائمة قبل المتابعة.' using errcode='40001';
  end if;
  insert into marriage.report_reviews(report_id) values(target) on conflict do nothing;
  select * into strict review from marriage.report_reviews where report_id=target for update;
  if review.assigned_to is not null and review.assigned_to<>staff.user_id and staff.role<>'owner' then
    raise exception 'البلاغ مسند إلى مراجع آخر.' using errcode='42501';
  end if;
  case decision
    when 'assign_self' then
      if report.resolved_at is not null then raise exception 'أعد فتح البلاغ قبل إسناده.' using errcode='22023'; end if;
    when 'resolve' then
      if report.resolved_at is not null then raise exception 'البلاغ مغلق بالفعل.' using errcode='22023'; end if;
      update marriage.reports set resolved_at=now() where id=target;
    when 'reopen' then
      if report.resolved_at is null then raise exception 'البلاغ مفتوح بالفعل.' using errcode='22023'; end if;
      update marriage.reports set resolved_at=null where id=target;
  end case;
  update marriage.report_reviews set assigned_to=staff.user_id,revision=revision+1,updated_at=now() where report_id=target;
  result:=jsonb_build_object('ok',true,'action',decision,'reportId',target);
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
    values(staff.user_id,staff.display_name,staff.role,decision,'report',target,btrim(note),operation_id,fingerprint,result);
  return result;
end $$;

create function marriage.admin_audit(before_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform marriage.require_staff(array['owner']);
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id::text,'actorId',a.actor_id,'actorName',a.actor_name,
    'actorRole',a.actor_role,'action',a.action,'targetType',a.target_type,'targetId',a.target_id,
    'reason',a.reason,'createdAt',a.created_at) order by a.id desc)
    from (select * from marriage.staff_audit where before_id is null or id<before_id order by id desc limit 100) a),'[]'::jsonb);
end $$;

create function public.marriage_admin_access() returns jsonb language sql security invoker set search_path='' as $$select marriage.admin_access()$$;
create function public.marriage_admin_overview() returns jsonb language sql security invoker set search_path='' as $$select marriage.admin_overview()$$;
create function public.marriage_admin_applications(status_filter text default 'pending',before_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_applications($1,$2)$$;
create function public.marriage_admin_member(member_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_member($1)$$;
create function public.marriage_admin_review(member_id uuid,action text,expected_revision text,reason text,request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_review($1,$2,$3,$4,$5)$$;
create function public.marriage_admin_reports(status_filter text default 'open',before_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_reports($1,$2)$$;
create function public.marriage_admin_report_action(report_id uuid,action text,expected_revision text,reason text,request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_report_action($1,$2,$3,$4,$5)$$;
create function public.marriage_admin_audit(before_id bigint default null) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_audit($1)$$;

-- Explicit allowlist: the public wrappers remain invokers, private helpers have
-- no API execute grant, and private tables have no direct member/staff grants.
do $$ declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='marriage' and p.proname in ('immutable_staff_audit','audit_staff_provisioning','audit_staff_invitation','staff_identity','require_staff',
      'admin_access','admin_review_revision','admin_member_summary','admin_overview','admin_applications','admin_member','admin_review',
      'admin_report_revision','admin_reports','admin_report_action','admin_audit'))
      or (n.nspname='public' and p.proname like 'marriage_admin_%') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function marriage.admin_access(),marriage.admin_overview(),marriage.admin_applications(text,uuid),
  marriage.admin_member(uuid),marriage.admin_review(uuid,text,text,text,uuid),marriage.admin_reports(text,uuid),
  marriage.admin_report_action(uuid,text,text,text,uuid),marriage.admin_audit(bigint),
  public.marriage_admin_access(),public.marriage_admin_overview(),public.marriage_admin_applications(text,uuid),
  public.marriage_admin_member(uuid),public.marriage_admin_review(uuid,text,text,text,uuid),public.marriage_admin_reports(text,uuid),
  public.marriage_admin_report_action(uuid,text,text,text,uuid),public.marriage_admin_audit(bigint) to authenticated;
