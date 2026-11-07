-- Explicit self-disclosures and purpose-specific onboarding choices, Nisfayn only.
-- Existing rows are not rewritten and no existing consent is inferred.
alter table marriage.member_basics
 add column current_wives smallint check(current_wives between 1 and 4),
 add column polygyny_preference text check(polygyny_preference in('not_open','open_to_discussion','open','prefer_not_to_say')),
 add column religious_affiliation text check(religious_affiliation in('sunni','shia','other','prefer_not_to_say')),
 add column prayer_practice text check(prayer_practice in('regular','working_on_consistency','private','prefer_not_to_say'));
alter table marriage.member_basics drop constraint member_basics_marital_status_check;
alter table marriage.member_basics add constraint member_basics_marital_status_check
 check(marital_status in('never_married','divorced','widowed','married'));

alter function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) rename to normalize_marriage_extras_before_onboarding_consent;
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; extra jsonb; k text; v jsonb; rule jsonb;
begin
 if jsonb_typeof(basics) is distinct from 'object' or jsonb_typeof(criteria) is distinct from 'object' then
  raise exception 'تحقق من تنسيق بيانات الزواج.' using errcode='22023';end if;
 result:=marriage.normalize_marriage_extras_before_onboarding_consent(
  basics-array['maritalStatus','currentWives','polygynyPreference','religiousAffiliation','prayerPractice'],criteria-'maritalStatus',personality,version);
 select coalesce(jsonb_object_agg(key,value),'{}') into extra from jsonb_each(basics)
  where key in('maritalStatus','currentWives','polygynyPreference','religiousAffiliation','prayerPractice');
 for k,v in select key,value from jsonb_each(extra) loop
  if k='currentWives' then
   if jsonb_typeof(v) is distinct from 'number' then raise exception 'اختر عدد الزوجات الحالي.' using errcode='22023';end if;
   if (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric not between 1 and 4 then
    raise exception 'اختر عدد الزوجات الحالي.' using errcode='22023';end if;
  elsif jsonb_typeof(v) is distinct from 'string'
   or (k='maritalStatus' and (v#>>'{}') not in('never_married','divorced','widowed','married'))
   or (k='polygynyPreference' and (v#>>'{}') not in('not_open','open_to_discussion','open','prefer_not_to_say'))
   or (k='religiousAffiliation' and (v#>>'{}') not in('sunni','shia','other','prefer_not_to_say'))
   or (k='prayerPractice' and (v#>>'{}') not in('regular','working_on_consistency','private','prefer_not_to_say')) then
   raise exception 'تحقق من اختيارات الزواج والدين.' using errcode='22023';
  end if;
 end loop;
 if (basics->>'maritalStatus'='married' and not(basics?'currentWives'))
  or (basics?'currentWives' and basics->>'maritalStatus' is distinct from 'married') then
  raise exception 'حدد وضعك الحالي وعدد الزوجات بدقة.' using errcode='22023';end if;
 result:=jsonb_set(result,'{marriageBasics}',(result->'marriageBasics')||extra);
 if criteria?'maritalStatus' then
  rule:=criteria->'maritalStatus';
  if jsonb_typeof(rule) is distinct from 'object' or coalesce(rule->>'mode','') not in('any','prefer','require') then
   raise exception 'تحقق من الحالات الاجتماعية المقبولة.' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(rule) f where f not in('mode','values')) then
   raise exception 'حقل غير معروف في شروط الحالة الاجتماعية.' using errcode='22023';end if;
  if rule->>'mode'='any' then rule:='{"mode":"any"}';else
   if jsonb_typeof(rule->'values') is distinct from 'array' then raise exception 'اختر الحالات الاجتماعية المقبولة.' using errcode='22023';end if;
   if jsonb_array_length(rule->'values') not between 1 and 4
    or exists(select 1 from jsonb_array_elements(rule->'values') e where jsonb_typeof(e)<>'string' or (e#>>'{}') not in('never_married','divorced','widowed','married'))
    or exists(select 1 from jsonb_array_elements(rule->'values') e group by e having count(*)>1) then
    raise exception 'اختر الحالات الاجتماعية المقبولة.' using errcode='22023';end if;
  end if;
  result:=jsonb_set(result,'{partnerCriteria}',(result->'partnerCriteria')||jsonb_build_object('maritalStatus',rule));
 end if;
 return result;
end $$;

create function marriage.validate_marriage_eligibility(gender text,basics jsonb) returns void
language plpgsql immutable set search_path='' as $$begin
 if basics->>'maritalStatus'='married' and gender is distinct from 'man' then
  raise exception 'هذا الوضع الاجتماعي غير متاح للبحث عن زواج في نصفين.' using errcode='22023';end if;
 if basics->>'maritalStatus'='married' and basics->'currentWives'='4'::jsonb then
  raise exception 'البحث عن زواج جديد غير متاح لهذا الوضع الحالي في نصفين.' using errcode='22023';end if;
end $$;

alter function marriage.basics_json(uuid) rename to basics_json_before_onboarding_consent;
create function marriage.basics_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.basics_json_before_onboarding_consent(target)||coalesce((select jsonb_strip_nulls(jsonb_build_object(
  'currentWives',current_wives,'polygynyPreference',polygyny_preference,'religiousAffiliation',religious_affiliation,'prayerPractice',prayer_practice))
  from marriage.member_basics where member_id=target),'{}')
$$;

-- These tables have no API grants/policies. Applications can only append through
-- validated save paths; existing account erasure can cascade its own private data.
create table marriage.signup_consent_events (
 id bigint generated always as identity primary key,
 member_id uuid not null references marriage.members(id) on delete cascade,
 version text not null check(version='2026-11-06-onboarding'),
 purpose text not null check(purpose in('adult_declaration','accepted_terms','privacy_notice','sensitive_profile','assessment_processing','profile_photo')),
 granted boolean not null,recorded_at timestamptz not null default now()
);
create index signup_consent_events_member on marriage.signup_consent_events(member_id,purpose,id desc);
create table nisfayn_test.signup_consent_events (
 id bigint generated always as identity primary key,
 actor text not null check(actor in('abdulrahman','reham')),
 version text not null check(version='2026-11-06-onboarding'),
 purpose text not null check(purpose in('adult_declaration','accepted_terms','privacy_notice','sensitive_profile','assessment_processing','profile_photo')),
 granted boolean not null,recorded_at timestamptz not null default now()
);
create index test_signup_consent_events_actor on nisfayn_test.signup_consent_events(actor,purpose,id desc);
alter table marriage.signup_consent_events enable row level security;
alter table nisfayn_test.signup_consent_events enable row level security;
revoke all on marriage.signup_consent_events,nisfayn_test.signup_consent_events from public,anon,authenticated,service_role;
revoke all on sequence marriage.signup_consent_events_id_seq,nisfayn_test.signup_consent_events_id_seq from public,anon,authenticated,service_role;

create function marriage.signup_consents_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select case when count(*)=0 then null else jsonb_object_agg(case purpose when 'adult_declaration' then 'adult'
  when 'accepted_terms' then 'terms' when 'privacy_notice' then 'privacy' when 'sensitive_profile' then 'sensitiveProfile'
  when 'assessment_processing' then 'assessment' else 'photo' end,granted)||jsonb_build_object('version','2026-11-06-onboarding') end
 from (select distinct on(purpose) purpose,granted from marriage.signup_consent_events where member_id=target order by purpose,id desc) latest
$$;
create function nisfayn_test.signup_consents_json(target text) returns jsonb language sql stable set search_path='' as $$
 select case when count(*)=0 then null else jsonb_object_agg(case purpose when 'adult_declaration' then 'adult'
  when 'accepted_terms' then 'terms' when 'privacy_notice' then 'privacy' when 'sensitive_profile' then 'sensitiveProfile'
  when 'assessment_processing' then 'assessment' else 'photo' end,granted)||jsonb_build_object('version','2026-11-06-onboarding') end
 from (select distinct on(purpose) purpose,granted from nisfayn_test.signup_consent_events where actor=target order by purpose,id desc) latest
$$;

create function marriage.signup_sensitive_snapshot(profile jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object(
  'skinTone',profile#>'{marriageBasics,skinTone}',
  'tribalBackground',case when profile#>>'{marriageBasics,tribalBackground}'<>'prefer_not_to_say' then profile#>'{marriageBasics,tribalBackground}' end,
  'tribeName',nullif(btrim(profile#>>'{marriageBasics,tribeName}'),''),
  'religiousAffiliation',case when profile#>>'{marriageBasics,religiousAffiliation}'<>'prefer_not_to_say' then profile#>'{marriageBasics,religiousAffiliation}' end,
  'prayerPractice',case when profile#>>'{marriageBasics,prayerPractice}' not in('private','prefer_not_to_say') then profile#>'{marriageBasics,prayerPractice}' end,
  'skinPreference',case when profile#>>'{partnerCriteria,skinTone,mode}'<>'any' then profile#>'{partnerCriteria,skinTone}' end,
  'tribalPreference',case when profile#>>'{partnerCriteria,tribalBackground,mode}'<>'any' then profile#>'{partnerCriteria,tribalBackground}' end,
  'avatarSkinTone',profile#>'{publicAvatar,skinTone}'))
$$;
create function marriage.signup_assessment_snapshot(profile jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object(
  'surveyAnswers',nullif(profile->'surveyAnswers','{}'::jsonb),
  'personalityAnswers',nullif(profile->'personalityAnswers','{}'::jsonb),
  'hardRequirements',nullif(profile->'hardRequirements','[]'::jsonb),
  'priorityCategories',nullif(profile->'priorityCategories','[]'::jsonb),
  'partnerCriteria',(select jsonb_object_agg(key,value) from jsonb_each(coalesce(profile->'partnerCriteria','{}')) where value->>'mode'<>'any')))
$$;
create function marriage.validate_signup_consents(profile jsonb,previous jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare choices jsonb:=profile->'signupConsents'; prior jsonb:=previous->'signupConsents'; k text;
begin
 if choices is null then
  if previous->>'displayName' is null then raise exception 'راجع إقرارات التسجيل قبل إنشاء ملفك.' using errcode='22023';end if;
  if prior is not null then choices:=prior;
  else
   -- Legacy saves may preserve prior disclosures, never create implied consent.
   if marriage.signup_sensitive_snapshot(profile) is distinct from marriage.signup_sensitive_snapshot(previous)
    or marriage.signup_assessment_snapshot(profile) is distinct from marriage.signup_assessment_snapshot(previous) then
    raise exception 'حدّث موافقاتك قبل تعديل البيانات الحساسة أو التقييمات.' using errcode='22023';end if;
   return null;
  end if;
 end if;
 if jsonb_typeof(choices) is distinct from 'object' or choices->>'version' is distinct from '2026-11-06-onboarding' then
  raise exception 'راجع نسخة إقرارات التسجيل الحالية.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(choices) field where field not in('version','adult','terms','privacy','sensitiveProfile','assessment','photo')) then
  raise exception 'تحقق من إقرارات التسجيل.' using errcode='22023';end if;
 foreach k in array array['adult','terms','privacy','sensitiveProfile','assessment','photo'] loop
  if choices?k and jsonb_typeof(choices->k) is distinct from 'boolean' then
   raise exception 'يجب أن يكون كل اختيار موافقة واضحًا.' using errcode='22023';end if;
 end loop;
 if choices->'adult' is distinct from 'true'::jsonb or choices->'terms' is distinct from 'true'::jsonb or choices->'privacy' is distinct from 'true'::jsonb then
  raise exception 'يلزم إقرار الأهلية ودقة المعلومات وقبول الشروط والاطلاع على إشعار الخصوصية.' using errcode='22023';end if;
 choices:=jsonb_build_object('version','2026-11-06-onboarding','adult',true,'terms',true,'privacy',true,
  'sensitiveProfile',coalesce((choices->>'sensitiveProfile')::boolean,false),
  'assessment',coalesce((choices->>'assessment')::boolean,false),'photo',coalesce((choices->>'photo')::boolean,false));
 if choices->'sensitiveProfile'='false'::jsonb and marriage.signup_sensitive_snapshot(profile)<>'{}'::jsonb then
  raise exception 'احذف التفاصيل الحساسة أو وافق صراحة على معالجتها ومشاركتها.' using errcode='22023';end if;
 if choices->'assessment'='false'::jsonb and marriage.signup_assessment_snapshot(profile)<>'{}'::jsonb then
  raise exception 'احذف إجابات التوافق وتفضيلات الشريك أو وافق على معالجتها للتوافق.' using errcode='22023';end if;
 return choices;
end $$;

create function marriage.signup_consent_rows(choices jsonb) returns table(purpose text,granted boolean)
language sql immutable set search_path='' as $$
 select purpose,(choices->>field)::boolean from (values
  ('adult_declaration','adult'),('accepted_terms','terms'),('privacy_notice','privacy'),
  ('sensitive_profile','sensitiveProfile'),('assessment_processing','assessment'),('profile_photo','photo')) p(purpose,field)
$$;

-- The existing profile writer and review/access rules remain in charge.
insert into marriage.consent_versions(version) values('2026-11-06-onboarding');
do $upgrade$ declare definition text;needle text:=$q$(case when payload->>'assessmentVersion' in('marriage-v1','marriage-v2')$q$;begin
 definition:=pg_get_functiondef('marriage.apply_profile(jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Unexpected profile consent validation definition';end if;
 definition:=replace(definition,needle,$q$(case when payload#>>'{signupConsents,version}'='2026-11-06-onboarding' then '2026-11-06-onboarding' when payload->>'assessmentVersion' in('marriage-v1','marriage-v2')$q$);
 execute definition;
end $upgrade$;
do $review$ declare definition text;needle text:='c.version=required_version';begin
 definition:=pg_get_functiondef('marriage.review_member(uuid,text)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Unexpected review consent validation definition';end if;
 definition:=replace(definition,needle,'c.version in(required_version,''2026-11-06-onboarding'')');
 execute definition;
end $review$;
alter function marriage.apply_profile(jsonb) rename to apply_profile_before_onboarding_consent;
create function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();previous jsonb;effective jsonb;basics jsonb;extras jsonb;choices jsonb;result jsonb;preserved jsonb;
begin
 perform 1 from marriage.members where id=me for update;
 previous:=coalesce(marriage.profile_json(me),'{}')||jsonb_build_object('signupConsents',marriage.signup_consents_json(me));
 if previous->'signupConsents'='null'::jsonb then previous:=previous-'signupConsents';end if;
 effective:=previous||payload;
 basics:=coalesce(effective->'marriageBasics','{}');
 if not(payload?'signupConsents') then
  select coalesce(jsonb_object_agg(key,value),'{}') into preserved from jsonb_each(coalesce(previous->'marriageBasics','{}'))
   where key in('currentWives','polygynyPreference','religiousAffiliation','prayerPractice');
  basics:=preserved||basics;
  if basics->>'maritalStatus' is distinct from 'married' then basics:=basics-'currentWives';end if;
 end if;
 effective:=jsonb_set(effective,'{marriageBasics}',basics);
 -- Match the existing writer's compatibility behavior for clients predating appearance.
 if payload->>'appearanceVersion' is distinct from 'appearance-v1' then
  select coalesce(jsonb_object_agg(key,value),'{}') into preserved from jsonb_each(coalesce(previous->'marriageBasics','{}')) where key in('skinTone','dressStyle','dressFlexibility');
  effective:=jsonb_set(effective,'{marriageBasics}',preserved||basics);
  select coalesce(jsonb_object_agg(key,value),'{}') into preserved from jsonb_each(coalesce(previous->'partnerCriteria','{}')) where key in('skinTone','dressStyle','dressFlexibility');
  effective:=jsonb_set(effective,'{partnerCriteria}',preserved||coalesce(effective->'partnerCriteria','{}'));
 end if;
 extras:=marriage.normalize_marriage_extras(coalesce(effective->'marriageBasics','{}'),coalesce(effective->'partnerCriteria','{}'),
  coalesce(effective->'personalityAnswers','{}'),coalesce(effective->>'personalityVersion','personality-v1'));
 effective:=effective||extras;
 perform marriage.validate_marriage_eligibility(effective->>'gender',extras->'marriageBasics');
 -- Strip inherited consent so only an explicit incoming choice appends a new event.
 if not(payload?'signupConsents') then effective:=effective-'signupConsents';end if;
 choices:=marriage.validate_signup_consents(effective,previous);
 result:=marriage.apply_profile_before_onboarding_consent(payload||extras||case when payload?'signupConsents'
  then jsonb_build_object('consentVersion','2026-11-06-onboarding') else '{}'::jsonb end);
 basics:=extras->'marriageBasics';
 update marriage.member_basics set current_wives=(basics->>'currentWives')::smallint,
  polygyny_preference=basics->>'polygynyPreference',religious_affiliation=basics->>'religiousAffiliation',prayer_practice=basics->>'prayerPractice'
  where member_id=me;
 if payload?'signupConsents' then
  insert into marriage.signup_consent_events(member_id,version,purpose,granted)
   select me,choices->>'version',purpose,granted from marriage.signup_consent_rows(choices);
  if choices->'photo'='false'::jsonb then delete from marriage.member_portraits where member_id=me;end if;
 end if;
 return marriage.member_state(me);
end $$;

-- Self-only state carries consent choices; profile_json remains review-content only.
alter function marriage.member_state(uuid) rename to member_state_before_onboarding_consent;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_onboarding_consent(target);choices jsonb:=marriage.signup_consents_json(target);
begin
 if choices is not null and jsonb_typeof(result->'profile')='object' then
  result:=jsonb_set(result,'{profile}',(result->'profile')||jsonb_build_object('signupConsents',choices));end if;
 return result;
end $$;

-- Non-disclosure is not a public trait. Religious answers never enter the score.
alter function marriage.member_card(uuid,uuid) rename to member_card_before_onboarding_consent;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_card_before_onboarding_consent(viewer,subject);basics jsonb:=marriage.basics_json(subject);
begin
 select coalesce(jsonb_object_agg(key,value),'{}') into basics from jsonb_each(basics)
  where value is distinct from '"prefer_not_to_say"'::jsonb;
 return jsonb_set(result-array['signupConsents','signupConsentRecordedAt'],'{marriageBasics}',basics);
end $$;

alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_onboarding_consent;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;previous jsonb;profile jsonb;extras jsonb;choices jsonb;result jsonb;person text;profiles jsonb;preserved jsonb;basics jsonb;
begin
 if action='profile' then
  select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
  if who is null then raise exception 'انتهت جلسة الاختبار. سجّل الدخول مجددًا.' using errcode='42501';end if;
  perform 1 from marriage.admin_test_members where actor=who for update;
  select coalesce(data#>array['profiles',who],'{}') into previous from nisfayn_test.room where id;
  choices:=nisfayn_test.signup_consents_json(who);
  if choices is not null then previous:=previous||jsonb_build_object('signupConsents',choices);end if;
  if jsonb_typeof(payload->'profile') is distinct from 'object' then raise exception 'ملف غير صالح.' using errcode='22023';end if;
  profile:=(previous-'signupConsents')||(payload->'profile')||jsonb_build_object('gender',case when who='reham' then 'woman' else 'man' end);
  if jsonb_typeof(profile->'age') is distinct from 'number' then raise exception 'أدخل عمرك الصحيح.' using errcode='22023';end if;
  if (profile->>'age')::numeric<>trunc((profile->>'age')::numeric) or (profile->>'age')::numeric not between 18 and 110 then
   raise exception 'التسجيل متاح للبالغين من عمر ١٨ عامًا.' using errcode='22023';end if;
  profile:=jsonb_set(profile,'{publicAvatar}',marriage.normalize_public_avatar(coalesce(profile->'publicAvatar','null')));
  if not((payload->'profile')?'signupConsents') then
   select coalesce(jsonb_object_agg(key,value),'{}') into preserved from jsonb_each(coalesce(previous->'marriageBasics','{}'))
    where key in('currentWives','polygynyPreference','religiousAffiliation','prayerPractice');
   basics:=preserved||coalesce(profile->'marriageBasics','{}');
   if basics->>'maritalStatus' is distinct from 'married' then basics:=basics-'currentWives';end if;
   profile:=jsonb_set(profile,'{marriageBasics}',basics);
  end if;
  extras:=marriage.normalize_marriage_extras(coalesce(profile->'marriageBasics','{}'),coalesce(profile->'partnerCriteria','{}'),
   coalesce(profile->'personalityAnswers','{}'),coalesce(profile->>'personalityVersion','personality-v1'));
  profile:=profile||extras;
  perform marriage.validate_marriage_eligibility(profile->>'gender',extras->'marriageBasics');
  choices:=marriage.validate_signup_consents(profile,previous);
  result:=nisfayn_test.rpc_before_onboarding_consent(action,session_token,jsonb_set(payload,'{profile}',profile-array['signupConsents','signupConsentRecordedAt']));
  if (payload->'profile')?'signupConsents' then
   insert into nisfayn_test.signup_consent_events(actor,version,purpose,granted)
    select who,choices->>'version',purpose,granted from marriage.signup_consent_rows(choices);
   if choices->'photo'='false'::jsonb then
    delete from nisfayn_test.member_portraits where actor=who;
    if jsonb_typeof(result#>array['profiles',who])='object' then result:=jsonb_set(result,array['profiles',who,'portrait'],'null'::jsonb);end if;
   end if;
  end if;
 else result:=nisfayn_test.rpc_before_onboarding_consent(action,session_token,payload);end if;
 if jsonb_typeof(result->'profiles')='object' then
  who:=result->>'actor';profiles:=result->'profiles';
  for person in select jsonb_object_keys(profiles) loop
   profiles:=jsonb_set(profiles,array[person],(profiles->person)-array['signupConsents','signupConsentRecordedAt']);
  end loop;
  choices:=nisfayn_test.signup_consents_json(who);
  if choices is not null and jsonb_typeof(profiles->who)='object' then
   profiles:=jsonb_set(profiles,array[who],(profiles->who)||jsonb_build_object('signupConsents',choices));end if;
  result:=jsonb_set(result,'{profiles}',profiles);
 end if;
 return result;
end $$;

revoke all on function marriage.normalize_marriage_extras_before_onboarding_consent(jsonb,jsonb,jsonb,text),
 marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text),marriage.validate_marriage_eligibility(text,jsonb),
 marriage.basics_json_before_onboarding_consent(uuid),marriage.basics_json(uuid),marriage.signup_consents_json(uuid),
 nisfayn_test.signup_consents_json(text),marriage.signup_sensitive_snapshot(jsonb),marriage.signup_assessment_snapshot(jsonb),
 marriage.validate_signup_consents(jsonb,jsonb),marriage.signup_consent_rows(jsonb),marriage.apply_profile_before_onboarding_consent(jsonb),
 marriage.apply_profile(jsonb),marriage.member_state_before_onboarding_consent(uuid),marriage.member_state(uuid),
 marriage.member_card_before_onboarding_consent(uuid,uuid),marriage.member_card(uuid,uuid),
 nisfayn_test.rpc_before_onboarding_consent(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function marriage.apply_profile(jsonb) to authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
