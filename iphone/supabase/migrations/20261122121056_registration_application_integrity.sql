-- Only newly submitted applications enter automatic admission. Existing approvals, pending
-- reviews, profile-edit reviews and suspensions remain under their existing lifecycle.
create table marriage.application_integrity_receipts (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  agreement_version text not null check (agreement_version = 'wudayn-application-integrity-v1'),
  accepted_at timestamptz not null default now(),
  submitted_fingerprint text not null,
  submission_retriable boolean not null default true,
  expected_portrait uuid,
  decision text not null check (decision in ('awaiting_photo', 'manual_review', 'automatic')),
  review_reasons text[] not null default '{}',
  review_resolved_at timestamptz
);
alter table marriage.application_integrity_receipts enable row level security;
revoke all on marriage.application_integrity_receipts from public, anon, authenticated, service_role;
create index application_integrity_review_queue on marriage.application_integrity_receipts(member_id)
  where cardinality(review_reasons)>0 and review_resolved_at is null;

-- A shared device is an indication to review, never proof of misconduct.
create function marriage.registration_review_reasons(target uuid) returns text[]
language sql stable set search_path = '' as $$
  with facts as (
    select marriage.profile_json(target) profile, marriage.signup_consents_json(target) consent
  )
  select array_remove(array[
    case when (consent @> '{"version":"2026-11-07-privacy","adult":true,"terms":true,"privacy":true,"sensitiveProfile":true,"sensitivePublication":true,"assessment":true}') is not true
      or profile->>'gender'='man' and consent->'photo' is distinct from 'true'::jsonb then 'consent_unconfirmed' end,
    case when not exists (select 1 from marriage.member_birth_dates b where b.member_id=target
      and marriage.birthday_age(b.birth_date) between 18 and 110)
      or coalesce(profile#>>'{marriageBasics,skinTone}','') !~ '^tone_[1-8]$' then 'eligibility_unconfirmed' end,
    case when profile->>'assessmentVersion' is distinct from 'marriage-v4'
      or profile->>'personalityVersion' is distinct from 'personality-v2'
      or marriage.required_onboarding_answers(profile || jsonb_build_object('signupConsents',consent)) is not true
      or marriage.valid_required_v4_answers(profile) is not true
      or not exists (select 1 from marriage.interview_receipts r join marriage.interview_sessions s using(owner_key)
        where r.owner_key='member:'||target::text and s.expires_at>now() and s.document->>'promptVersion'='wudayn-interview-5'
          and (r.fallback_at is not null or (r.completed_at is not null and s.document->>'status'='confirmed'
            and marriage.interview_complete_v5(s.document)
            and r.analysis_fingerprint=md5(jsonb_build_array(s.document->'turns',s.document->'proposals')::text))))
      then 'assessment_unconfirmed' end,
    case when exists (
      select 1 from marriage.registration_devices a join marriage.registration_devices b using(device_hash)
      join marriage.members linked on linked.id=b.user_id
      where a.user_id=target and b.user_id<>target and linked.suspended
    ) or exists (
      select 1 from marriage.signup_phone_verifications a join marriage.signup_phone_verifications b using(phone)
      join marriage.members linked on linked.id=b.user_id
      where a.user_id=target and b.user_id<>target and linked.suspended
    ) then 'repeat_registration' end,
    case when not exists (select 1 from auth.users u where u.id=target and nullif(u.phone,'') is not null and u.phone_confirmed_at is not null)
      and not exists (select 1 from marriage.signup_phone_verifications v where v.user_id=target)
      then 'phone_unverified' end,
    case when exists (select 1 from marriage.reports where reported_id=target and resolved_at is null)
      then 'open_safety_report' end,
    case when not exists (select 1 from marriage.membership_readiness_receipts where member_id=target and response->>'agreement'='wudayn-membership-v1')
      then 'readiness_unconfirmed' end,
    case when exists (select 1 from marriage.portrait_stages s join marriage.member_portraits p on p.id=s.photo_id
      join marriage.profiles profile on profile.member_id=s.member_id
      where s.member_id=target and not p.ready and (s.status in ('uploaded','moderation','rejected')
        or s.declared_gender<>profile.gender or s.created_at<=now()-interval '7 days'))
      then 'photo_review' end,
    case when exists (select 1 from marriage.reviews where member_id=target and action='suspend')
      or exists(select 1 from marriage.staff_audit where target_type='member' and target_id=target
        and action in ('return_pending','suspend','restore','edit_profile'))
      then 'application_changed' end
  ]::text[], null) from facts;
$$;
revoke all on function marriage.registration_review_reasons(uuid) from public, anon, authenticated, service_role;

-- Called with the member row locked, only for the original application. The existing
-- review function performs the final eligibility checks and writes the approval audit.
create function marriage.decide_registration(target uuid) returns void
language plpgsql set search_path = '' as $$
declare
  receipt marriage.application_integrity_receipts;
  m marriage.members;
  reasons text[];
begin
  select * into m from marriage.members where id=target for update;
  select * into receipt from marriage.application_integrity_receipts where member_id=target for update;
  if not found or receipt.decision<>'awaiting_photo' or m.review_status<>'pending' or m.suspended then return; end if;
  perform marriage.validate_marriage_eligibility(p.gender,marriage.basics_json(target)) from marriage.profiles p where p.member_id=target;
  reasons:=marriage.registration_review_reasons(target);
  if not reasons <@ array['open_safety_report','repeat_registration']::text[] then
    update marriage.application_integrity_receipts set decision='manual_review',review_reasons=reasons where member_id=target;
    return;
  end if;
  if receipt.expected_portrait is not null and not exists (
    select 1 from marriage.member_portraits p join marriage.portrait_stages s on s.photo_id=p.id
    join marriage.profiles profile on profile.member_id=p.member_id
    where p.member_id=target and p.id=receipt.expected_portrait and p.ready and s.declared_gender=profile.gender
      and ((profile.gender='woman' and s.status='ready') or s.status in ('verified','approved'))
  ) then return; end if;
  if exists(select 1 from marriage.profiles where member_id=target and gender='man') and not exists (
    select 1 from marriage.member_portraits p join marriage.portrait_stages s on s.photo_id=p.id
    where p.member_id=target and p.ready and s.member_id=target and s.declared_gender='man' and s.status in ('verified','approved')
  ) then
    update marriage.application_integrity_receipts set decision='manual_review',review_reasons=array['photo_review'] where member_id=target;
    return;
  end if;
  perform marriage.review_member(target,'approve');
  update marriage.application_integrity_receipts set decision='automatic',review_reasons=reasons where member_id=target;
end $$;
revoke all on function marriage.decide_registration(uuid) from public, anon, authenticated, service_role;

alter function marriage.apply_profile(jsonb) rename to apply_profile_before_integrity;
revoke all on function marriage.apply_profile_before_integrity(jsonb) from public, anon, authenticated, service_role;
create function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid:=marriage.require_member();
  m marriage.members;
  old_receipt marriage.application_integrity_receipts;
  body jsonb:=payload-'_applicationIntegrity';
  first_submission boolean;
  stage_id uuid;
  result jsonb;
begin
  select * into strict m from marriage.members where id=me for update;
  if m.suspended then raise exception 'الحساب قيد المراجعة.' using errcode='42501'; end if;
  first_submission:=not exists(select 1 from marriage.profiles where member_id=me);
  select * into old_receipt from marriage.application_integrity_receipts where member_id=me;
  if old_receipt.submission_retriable and payload->>'_applicationIntegrity'=old_receipt.agreement_version
    and old_receipt.submitted_fingerprint=md5(body::text) then
    return marriage.member_state(me);
  end if;
  -- Run the full existing validation chain. Any failure, including missing acceptance
  -- below, rolls back the profile, consent events and readiness receipt together.
  result:=marriage.apply_profile_before_integrity(body);
  if not first_submission then
    if old_receipt.submission_retriable then
      update marriage.application_integrity_receipts set submission_retriable=false where member_id=me;
    end if;
    if (old_receipt.decision='awaiting_photo' or old_receipt.decision='manual_review' and 'photo_review'=any(old_receipt.review_reasons))
      and old_receipt.submitted_fingerprint<>md5(body::text) and not ('application_changed'=any(old_receipt.review_reasons)) then
      update marriage.application_integrity_receipts set decision='manual_review',review_reasons=array_append(review_reasons,'application_changed') where member_id=me;
    end if;
    return result;
  end if;
  if payload->'_applicationIntegrity' is distinct from '"wudayn-application-integrity-v1"'::jsonb then
    raise exception 'أكّد إقرار صحة جميع إجابات طلب العضوية قبل الإرسال. إذا لم يظهر الإقرار، حدّث التطبيق أو افتح وُدَين من المتصفح.' using errcode='22023';
  end if;
  if body#>'{signupConsents,photo}'='true'::jsonb then
    select s.photo_id into stage_id from marriage.portrait_stages s join marriage.member_portraits p on p.id=s.photo_id
    where s.member_id=me and p.member_id=me and not p.ready and s.status in('ready','verified','approved','moderation')
      and s.created_at>now()-interval '7 days' order by s.created_at desc,s.photo_id limit 1;
  end if;
  insert into marriage.application_integrity_receipts(member_id,agreement_version,submitted_fingerprint,expected_portrait,decision)
    values(me,'wudayn-application-integrity-v1',md5(body::text),stage_id,'awaiting_photo');
  if m.review_status='draft' then
    perform marriage.decide_registration(me);
  else
    update marriage.application_integrity_receipts set decision='manual_review',review_reasons=array['application_changed'] where member_id=me;
  end if;
  return marriage.member_state(me);
end $$;
revoke all on function marriage.apply_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function marriage.apply_profile(jsonb) to authenticated;
create or replace function public.marriage_apply(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select marriage.apply_profile($1)$$;

-- Initial portrait publication is a separate, recoverable client operation. Approve only
-- once its trusted ready transition has actually succeeded, even when a device resumes it.
create function marriage.finish_registration_portrait() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from marriage.application_integrity_receipts where member_id=new.member_id and decision<>'automatic') then return new; end if;
  perform 1 from marriage.members where id=new.member_id and review_status='pending' and not suspended for update;
  if not found then return new; end if;
  -- An authorized portrait review can be the only outstanding membership gate.
  update marriage.application_integrity_receipts r set decision='awaiting_photo'
    where r.member_id=new.member_id and r.expected_portrait=new.id and r.decision='manual_review'
      and r.review_reasons @> array['photo_review'] and r.review_reasons <@ array['photo_review','repeat_registration','open_safety_report'];
  if exists(select 1 from marriage.application_integrity_receipts r where r.member_id=new.member_id and r.decision='awaiting_photo') then
    update marriage.application_integrity_receipts set decision='manual_review',review_reasons=array['application_changed']
      where member_id=new.member_id and decision='awaiting_photo' and expected_portrait is distinct from new.id;
    perform marriage.decide_registration(new.member_id);
  end if;
  return new;
end $$;
revoke all on function marriage.finish_registration_portrait() from public, anon, authenticated, service_role;
create trigger registration_portrait_ready after update of ready on marriage.member_portraits
  for each row when (new.ready and not old.ready) execute function marriage.finish_registration_portrait();

-- Staff and automated approvals share the same first-application portrait gate.
-- Later public edits and withdrawals retain the normal profile review lifecycle.
create function marriage.guard_registration_portrait() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from marriage.application_integrity_receipts where member_id=new.id)
    and not exists(select 1 from marriage.reviews where member_id=new.id and action='approve')
    and (exists(select 1 from marriage.application_integrity_receipts r where r.member_id=new.id and r.decision='awaiting_photo'
      and r.expected_portrait is not null and not exists(select 1 from marriage.member_portraits p
        where p.member_id=new.id and p.id=r.expected_portrait and p.ready))
    or exists(select 1 from marriage.profiles where member_id=new.id and gender='man')
    and not exists(select 1 from marriage.member_portraits p join marriage.portrait_stages s on p.id=s.photo_id
      where p.member_id=new.id and s.member_id=new.id and p.ready and s.declared_gender='man' and s.status in ('verified','approved'))) then
    raise exception 'أكمل التحقق من صورة الملف واعتمد نشرها قبل اعتماد العضوية.' using errcode='42501';
  end if;
  update marriage.application_integrity_receipts set review_resolved_at=now()
    where member_id=new.id and decision='manual_review' and review_resolved_at is null;
  return new;
end $$;
revoke all on function marriage.guard_registration_portrait() from public,anon,authenticated,service_role;
create trigger registration_approval_portrait before update of review_status on marriage.members
  for each row when (new.review_status='approved' and old.review_status<>'approved') execute function marriage.guard_registration_portrait();

-- The existing authenticated admin routes retain their role and scope gates.
alter function marriage.admin_member_summary(uuid) rename to admin_member_summary_before_integrity;
revoke all on function marriage.admin_member_summary_before_integrity(uuid) from public,anon,authenticated,service_role;
create function marriage.admin_member_summary(target uuid) returns jsonb language sql stable set search_path='' as $$
  select marriage.admin_member_summary_before_integrity(target) || jsonb_build_object(
    'applicationDecision',r.decision,'applicationReviewReasons',coalesce(to_jsonb(r.review_reasons),'[]'::jsonb),
    'applicationReviewResolvedAt',r.review_resolved_at)
  from (select 1) seed left join marriage.application_integrity_receipts r on r.member_id=target;
$$;
revoke all on function marriage.admin_member_summary(uuid) from public,anon,authenticated,service_role;

alter function marriage.admin_applications(text,uuid) rename to admin_applications_before_integrity;
revoke all on function marriage.admin_applications_before_integrity(text,uuid) from public,anon,authenticated,service_role;
create function marriage.admin_applications(status_filter text,before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if status_filter is distinct from 'registration_review' then
    return marriage.admin_applications_before_integrity(status_filter,before_id);
  end if;
  perform marriage.require_staff(array['owner','reviewer']);
  return (select coalesce(jsonb_agg(marriage.admin_member_summary(q.member_id) order by q.member_id desc),'[]'::jsonb) from (
    select r.member_id from marriage.application_integrity_receipts r join marriage.members m on m.id=r.member_id
    where cardinality(r.review_reasons)>0 and r.review_resolved_at is null and not m.suspended
      and (r.decision='manual_review' and m.review_status='pending' or r.decision='automatic' and m.review_status='approved')
      and (before_id is null or r.member_id<before_id) order by r.member_id desc limit 50) q);
end $$;
revoke all on function marriage.admin_applications(text,uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.admin_applications(text,uuid) to authenticated;
create or replace function public.marriage_admin_applications(status_filter text default 'pending',before_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_applications($1,$2)$$;

create function marriage.admin_clear_registration_review(member_id uuid,expected_revision text,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']);
  m marriage.members;
  receipt marriage.application_integrity_receipts;
begin
  if member_id=staff.user_id or length(btrim(coalesce(reason,''))) not between 3 and 500 then
    raise exception 'راجع الطلب وأدخل سببًا صالحًا لإنهاء المراجعة.' using errcode='22023';
  end if;
  select * into m from marriage.members m0 where m0.id=member_id for update;
  select * into receipt from marriage.application_integrity_receipts r where r.member_id=m.id for update;
  if not found or m.suspended or m.review_status<>'approved' or receipt.decision<>'automatic' or cardinality(receipt.review_reasons)=0 then
    raise exception 'الطلب غير متاح لهذه المراجعة.' using errcode='22023';
  end if;
  if receipt.review_resolved_at is null then
    if marriage.admin_review_revision(m.id) is distinct from expected_revision then
      raise exception 'تغيّر الملف. أعد فتحه قبل إنهاء المراجعة.' using errcode='40001';
    end if;
    update marriage.application_integrity_receipts r set review_resolved_at=now() where r.member_id=m.id;
    insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
      values(staff.user_id,staff.display_name,staff.role,'registration_review_cleared','member',m.id,btrim(reason));
  end if;
  return marriage.admin_member_summary(m.id);
end $$;
revoke all on function marriage.admin_clear_registration_review(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function marriage.admin_clear_registration_review(uuid,text,text) to authenticated;
create function public.marriage_admin_clear_registration_review(member_id uuid,expected_revision text,reason text) returns jsonb
language sql security invoker set search_path='' as $$select marriage.admin_clear_registration_review($1,$2,$3)$$;
revoke all on function public.marriage_admin_clear_registration_review(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.marriage_admin_clear_registration_review(uuid,text,text) to authenticated;
