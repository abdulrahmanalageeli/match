-- Separate explicit publication from private processing. Existing processing
-- receipts remain valid; historical combined wording never grants publication.
alter table marriage.signup_consent_events drop constraint signup_consent_events_version_check;
alter table marriage.signup_consent_events drop constraint signup_consent_events_purpose_check;
alter table nisfayn_test.signup_consent_events drop constraint signup_consent_events_version_check;
alter table nisfayn_test.signup_consent_events drop constraint signup_consent_events_purpose_check;
alter table marriage.signup_consent_events add constraint signup_consent_events_version_check check(version in('2026-11-06-onboarding','2026-11-07-privacy'));
alter table nisfayn_test.signup_consent_events add constraint signup_consent_events_version_check check(version in('2026-11-06-onboarding','2026-11-07-privacy'));
alter table marriage.signup_consent_events add constraint signup_consent_events_purpose_check check(purpose in('adult_declaration','accepted_terms','privacy_notice','sensitive_profile','sensitive_publication','assessment_processing','profile_photo'));
alter table nisfayn_test.signup_consent_events add constraint signup_consent_events_purpose_check check(purpose in('adult_declaration','accepted_terms','privacy_notice','sensitive_profile','sensitive_publication','assessment_processing','profile_photo'));
insert into marriage.consent_versions(version) values('2026-11-07-privacy');

create or replace function marriage.signup_consents_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 with latest as(select distinct on(purpose) purpose,granted,version,id from marriage.signup_consent_events where member_id=target order by purpose,id desc)
 select case when count(*)=0 then null else jsonb_object_agg(case purpose when 'adult_declaration' then 'adult'
  when 'accepted_terms' then 'terms' when 'privacy_notice' then 'privacy' when 'sensitive_profile' then 'sensitiveProfile'
  when 'sensitive_publication' then 'sensitivePublication' when 'assessment_processing' then 'assessment' else 'photo' end,granted)
  ||jsonb_build_object('version',(select version from latest order by id desc limit 1),'sensitivePublication',
    coalesce((select granted and version='2026-11-07-privacy' from latest where purpose='sensitive_publication'),false)
    and coalesce((select granted from latest where purpose='sensitive_profile'),false)) end from latest
$$;
create or replace function nisfayn_test.signup_consents_json(target text) returns jsonb language sql stable set search_path='' as $$
 with latest as(select distinct on(purpose) purpose,granted,version,id from nisfayn_test.signup_consent_events where actor=target order by purpose,id desc)
 select case when count(*)=0 then null else jsonb_object_agg(case purpose when 'adult_declaration' then 'adult'
  when 'accepted_terms' then 'terms' when 'privacy_notice' then 'privacy' when 'sensitive_profile' then 'sensitiveProfile'
  when 'sensitive_publication' then 'sensitivePublication' when 'assessment_processing' then 'assessment' else 'photo' end,granted)
  ||jsonb_build_object('version',(select version from latest order by id desc limit 1),'sensitivePublication',
    coalesce((select granted and version='2026-11-07-privacy' from latest where purpose='sensitive_publication'),false)
    and coalesce((select granted from latest where purpose='sensitive_profile'),false)) end from latest
$$;

create or replace function marriage.validate_signup_consents(profile jsonb,previous jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare choices jsonb:=profile->'signupConsents'; prior jsonb:=previous->'signupConsents'; k text;
begin
 if choices is null then
  if previous->>'displayName' is null then raise exception 'راجع إقرارات التسجيل قبل إنشاء ملفك.' using errcode='22023';end if;
  if prior is not null then choices:=prior;
  else
   if marriage.signup_sensitive_snapshot(profile) is distinct from marriage.signup_sensitive_snapshot(previous)
    or marriage.signup_assessment_snapshot(profile) is distinct from marriage.signup_assessment_snapshot(previous) then
    raise exception 'حدّث موافقاتك قبل تعديل البيانات الحساسة أو التقييمات.' using errcode='22023';end if;
   return null;
  end if;
 end if;
 if jsonb_typeof(choices) is distinct from 'object' or coalesce(choices->>'version','') not in('2026-11-06-onboarding','2026-11-07-privacy') then
  raise exception 'راجع نسخة إقرارات التسجيل الحالية.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(choices) field where field not in('version','adult','terms','privacy','sensitiveProfile','sensitivePublication','assessment','photo')) then
  raise exception 'تحقق من إقرارات التسجيل.' using errcode='22023';end if;
 foreach k in array array['adult','terms','privacy','sensitiveProfile','sensitivePublication','assessment','photo'] loop
  if choices?k and jsonb_typeof(choices->k) is distinct from 'boolean' then
   raise exception 'يجب أن يكون كل اختيار موافقة واضحًا.' using errcode='22023';end if;
 end loop;
 if choices->'adult' is distinct from 'true'::jsonb or choices->'terms' is distinct from 'true'::jsonb or choices->'privacy' is distinct from 'true'::jsonb then
  raise exception 'يلزم إقرار الأهلية ودقة المعلومات وقبول الشروط والاطلاع على إشعار الخصوصية.' using errcode='22023';end if;
 if choices->'sensitivePublication'='true'::jsonb and choices->>'version'<>'2026-11-07-privacy' then
  raise exception 'راجع موافقة عرض التفاصيل الحساسة المنفصلة.' using errcode='22023';end if;
 choices:=jsonb_build_object('version',choices->>'version','adult',true,'terms',true,'privacy',true,
  'sensitiveProfile',coalesce((choices->>'sensitiveProfile')::boolean,false),
  'sensitivePublication',coalesce((choices->>'sensitiveProfile')::boolean,false) and coalesce((choices->>'sensitivePublication')::boolean,false),
  'assessment',coalesce((choices->>'assessment')::boolean,false),'photo',coalesce((choices->>'photo')::boolean,false));
 if choices->'sensitiveProfile'='false'::jsonb and marriage.signup_sensitive_snapshot(profile)<>'{}'::jsonb then
  raise exception 'احذف التفاصيل الحساسة أو وافق صراحة على معالجتها.' using errcode='22023';end if;
 if choices->'assessment'='false'::jsonb and marriage.signup_assessment_snapshot(profile)<>'{}'::jsonb then
  raise exception 'احذف إجابات التوافق وتفضيلات الشريك أو وافق على معالجتها للتوافق.' using errcode='22023';end if;
 return choices;
end $$;
create or replace function marriage.signup_consent_rows(choices jsonb) returns table(purpose text,granted boolean)
language sql immutable set search_path='' as $$
 select purpose,coalesce((choices->>field)::boolean,false) from (values
  ('adult_declaration','adult'),('accepted_terms','terms'),('privacy_notice','privacy'),
  ('sensitive_profile','sensitiveProfile'),('sensitive_publication','sensitivePublication'),('assessment_processing','assessment'),('profile_photo','photo')) p(purpose,field)
$$;

-- Keep older clients/receipts functional, and record the new version accurately.
do $upgrade$ declare definition text; needle text; item record; begin
 definition:=pg_get_functiondef('marriage.apply_profile_before_onboarding_consent(jsonb)'::regprocedure);
 needle:=$q$when payload#>>'{signupConsents,version}'='2026-11-06-onboarding' then '2026-11-06-onboarding'$q$;
 if position(needle in definition)=0 then raise exception 'Unexpected core profile consent version guard';end if;
 execute replace(definition,needle,$q$when payload#>>'{signupConsents,version}' in('2026-11-06-onboarding','2026-11-07-privacy') then payload#>>'{signupConsents,version}'$q$);
 definition:=pg_get_functiondef('marriage.apply_profile_before_beena(jsonb)'::regprocedure);
 needle:=$q$jsonb_build_object('consentVersion','2026-11-06-onboarding')$q$;
 if position(needle in definition)=0 then raise exception 'Unexpected consent profile writer';end if;
 execute replace(definition,needle,$q$jsonb_build_object('consentVersion',choices->>'version')$q$);
 definition:=pg_get_functiondef('marriage.review_member(uuid,text)'::regprocedure);
 needle:=$q$c.version in(required_version,'2026-11-06-onboarding')$q$;
 if position(needle in definition)=0 then raise exception 'Unexpected review consent guard';end if;
 execute replace(definition,needle,$q$c.version in(required_version,'2026-11-06-onboarding','2026-11-07-privacy')$q$);
 -- Portrait helpers may have been wrapped by later portrait-reveal migrations.
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('marriage','nisfayn_test') and p.prokind='f' loop
  definition:=pg_get_functiondef(item.oid);
  needle:=$q$coalesce(marriage.signup_consents_json(me)->>'version','')<>'2026-11-06-onboarding'$q$;
  if position(needle in definition)>0 then execute replace(definition,needle,$q$coalesce(marriage.signup_consents_json(me)->>'version','') not in('2026-11-06-onboarding','2026-11-07-privacy')$q$);end if;
  needle:=$q$coalesce(nisfayn_test.signup_consents_json(who)->>'version','')<>'2026-11-06-onboarding'$q$;
  if position(needle in definition)>0 then execute replace(definition,needle,$q$coalesce(nisfayn_test.signup_consents_json(who)->>'version','') not in('2026-11-06-onboarding','2026-11-07-privacy')$q$);end if;
 end loop;
end $upgrade$;

create function marriage.sensitive_publication_allowed(target uuid) returns boolean language sql stable set search_path='' as $$
 select coalesce(marriage.signup_consents_json($1)->'sensitivePublication'='true'::jsonb,false)
$$;
create function marriage.public_sensitive_fields(profile jsonb,publication_allowed boolean) returns jsonb language sql immutable set search_path='' as $$
 select case when publication_allowed is true then profile else
  jsonb_set(profile,'{marriageBasics}',coalesce(profile->'marriageBasics','{}')-array['skinTone','tribalBackground','tribeName','religiousAffiliation','prayerPractice'])||jsonb_build_object('publicAvatar',null) end
$$;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_sensitive_publication;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.public_sensitive_fields(marriage.member_card_before_sensitive_publication($1,$2),marriage.sensitive_publication_allowed($2))
$$;
-- Public discovery filters must not expose a private tribal field by membership.
do $filters$ declare definition text;needle text;begin
 definition:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 needle:='b.tribal_background';
 if position(needle in definition)=0 then raise exception 'Unexpected tribal filter definition';end if;
 execute replace(definition,needle,'(case when marriage.sensitive_publication_allowed(p.member_id) then b.tribal_background end)');
end $filters$;

-- Service-only tester state supplies a minimal permission summary. The edge
-- computes fit using the private inputs, then redacts peer data before delivery.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_sensitive_publication;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:=nisfayn_test.rpc_before_sensitive_publication(action,session_token,payload);begin
 if jsonb_typeof(result->'profiles')='object' then
  result:=result||jsonb_build_object('sensitivePublication',jsonb_build_object(
   'abdulrahman',coalesce(nisfayn_test.signup_consents_json('abdulrahman')->'sensitivePublication'='true'::jsonb,false),
   'reham',coalesce(nisfayn_test.signup_consents_json('reham')->'sensitivePublication'='true'::jsonb,false)));
 end if;
 return result;
end $$;
revoke all on function marriage.sensitive_publication_allowed(uuid),marriage.public_sensitive_fields(jsonb,boolean),
 marriage.member_card_before_sensitive_publication(uuid,uuid),marriage.member_card(uuid,uuid),
 nisfayn_test.rpc_before_sensitive_publication(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
