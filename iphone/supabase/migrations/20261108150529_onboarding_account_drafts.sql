-- Private resumable onboarding. This never creates a public profile, approval,
-- subscription, or final signup/publication consent.
create table marriage.onboarding_drafts (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=20000),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days'
);
alter table marriage.onboarding_drafts enable row level security;
revoke all on marriage.onboarding_drafts from public,anon,authenticated,service_role;
create index onboarding_drafts_expiry on marriage.onboarding_drafts(expires_at);

create function marriage.onboarding_draft(command text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();doc jsonb;answers jsonb;permissions jsonb;baseline text;
begin
 if command is null or command not in ('load','save','delete') then raise exception 'طلب غير صالح.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('onboarding-draft:'||me::text,0));
 if command='delete' then delete from marriage.onboarding_drafts where member_id=me;return null;end if;
 if command='load' then
  delete from marriage.onboarding_drafts where member_id=me and expires_at<=now();
  select document into doc from marriage.onboarding_drafts where member_id=me;
  return doc;
 end if;
 if exists(select 1 from marriage.members where id=me and suspended) then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>20000
  or payload->'version' is distinct from '1'::jsonb or payload->>'owner' is distinct from me::text
  or jsonb_typeof(payload->'answers') is distinct from 'object'
  or jsonb_typeof(payload->'baseline') is distinct from 'string' or coalesce(payload->>'baseline','') !~ '^[0-9a-f]{64}$'
  or coalesce(payload->>'step','') not in ('identity','story','details','avatar','criteria','compatibility','personality','beena','preferences','review')
  or jsonb_typeof(payload->'returnToReview') is distinct from 'boolean' then
  raise exception 'المسودة غير صالحة.' using errcode='22023';
 end if;
 answers:=payload->'answers';permissions:=payload->'permissions';baseline:=payload->>'baseline';
 if jsonb_typeof(permissions) is distinct from 'object' or permissions->>'version' is distinct from '2026-11-07-privacy'
  or jsonb_typeof(permissions->'sensitiveProfile') is distinct from 'boolean' or jsonb_typeof(permissions->'assessment') is distinct from 'boolean'
  or exists(select 1 from jsonb_object_keys(permissions) k where k not in('version','sensitiveProfile','assessment')) then
  raise exception 'راجع خيارات خصوصية المسودة.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_object_keys(answers) k where k not in(
  'displayName','age','gender','city','profession','bio','contact','preferredMinAge','preferredMaxAge','familyPreference',
  'lookingFor','lifeTogether','valuesStatement','education','marriageIntent','interestIds','surveyAnswers','assessmentVersion',
  'hardRequirements','priorityCategories','marriageBasics','partnerCriteria','personalityAnswers','personalityVersion',
  'publicAvatar','appearanceVersion','beena')) then raise exception 'تحتوي المسودة على بيانات غير مدعومة.' using errcode='22023';end if;
 -- Never store optional sensitive/assessment answers without the explicit
 -- current draft-purpose choice. Draft choices do not grant publication.
 if permissions->'sensitiveProfile'='false'::jsonb then
  answers:=answers||jsonb_build_object('marriageBasics',coalesce(answers->'marriageBasics','{}'::jsonb)-array['skinTone','tribalBackground','tribeName','religiousAffiliation','prayerPractice'],
    'partnerCriteria',coalesce(answers->'partnerCriteria','{}'::jsonb)-array['skinTone','tribalBackground'],'publicAvatar',null);
 end if;
 if permissions->'assessment'='false'::jsonb then
  answers:=answers||jsonb_build_object('surveyAnswers','{}'::jsonb,'personalityAnswers','{}'::jsonb,'partnerCriteria','{}'::jsonb,
    'hardRequirements','[]'::jsonb,'priorityCategories','[]'::jsonb,'beena',null);
 end if;
 doc:=jsonb_build_object('version',1,'owner',me,'baseline',baseline,'step',payload->>'step','returnToReview',payload->'returnToReview',
  'savedAt',floor(extract(epoch from clock_timestamp())*1000),'answers',answers,'permissions',permissions);
 insert into marriage.onboarding_drafts(member_id,document) values(me,doc)
 on conflict(member_id) do update set document=excluded.document,updated_at=now(),expires_at=now()+interval '7 days';
 return jsonb_build_object('saved',true);
end $$;
create function public.marriage_onboarding_draft(command text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select marriage.onboarding_draft($1,$2)$$;
revoke all on function marriage.onboarding_draft(text,jsonb),public.marriage_onboarding_draft(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.onboarding_draft(text,jsonb),public.marriage_onboarding_draft(text,jsonb) to authenticated;

-- The existing production maintenance worker already runs daily. Expired drafts
-- are unreadable at seven days and physically purged by its next run.
alter function marriage.operations_cleanup() rename to operations_cleanup_before_onboarding_drafts;
create function marriage.operations_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;removed integer;
begin
 result:=marriage.operations_cleanup_before_onboarding_drafts();
 delete from marriage.onboarding_drafts where expires_at<=now();get diagnostics removed=row_count;
 return result||jsonb_build_object('expiredOnboardingDrafts',removed);
end $$;
revoke all on function marriage.operations_cleanup(),marriage.operations_cleanup_before_onboarding_drafts() from public,anon,authenticated,service_role;
grant execute on function marriage.operations_cleanup() to service_role;

-- Account exports include only the member's unexpired private draft. The
-- baseline hash is an internal conflict marker, not an additional profile.
alter function marriage.personal_data() rename to personal_data_before_onboarding_drafts;
create function marriage.personal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();result jsonb;draft jsonb;
begin
 result:=marriage.personal_data_before_onboarding_drafts();
 select (d.document-'baseline')||jsonb_build_object('updatedAt',d.updated_at,'expiresAt',d.expires_at)
 into draft from marriage.onboarding_drafts d where d.member_id=me and d.expires_at>now();
 return result||jsonb_build_object('onboardingDraft',draft);
end $$;
revoke all on function marriage.personal_data_before_onboarding_drafts(),marriage.personal_data() from public,anon,authenticated,service_role;
grant execute on function marriage.personal_data() to authenticated;
