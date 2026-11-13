-- Required onboarding assessment and server-only completion/fallback receipts.
-- Existing profiles and their privacy withdrawal/editing routes remain editable.
create function marriage.interview_required_complete(items jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(items)='array' and jsonb_array_length(items)=44 and not exists(
   select 1 from unnest(array['preference:children_plan:self','preference:children_plan:partner','preference:residence_plan:self','preference:residence_plan:partner','preference:wife_work:self','preference:wife_work:partner','preference:marriage_timeline:self','preference:marriage_timeline:partner','preference:family_boundaries:self','preference:family_boundaries:partner','preference:shared_budget:self','preference:shared_budget:partner','preference:household_roles:self','preference:household_roles:partner','preference:weekly_planning:self','preference:weekly_planning:partner','preference:social_rhythm:self','preference:social_rhythm:partner','preference:conversation_initiative_preference:self','preference:conversation_initiative_preference:partner','preference:match_disagreement_style:self','preference:match_disagreement_style:partner','preference:repair_after_conflict:self','preference:repair_after_conflict:partner','preference:conversation_depth:self','preference:conversation_depth:partner','preference:closeness_pace:self','preference:closeness_pace:partner','preference:curiosity_style:self','preference:curiosity_style:partner','preference:early_openness:self','preference:early_openness:partner','personality:social_energy:self','personality:initiative:self','personality:depth:self','personality:openness:self','personality:closeness:self','personality:reassurance:self','personality:support:self','personality:planning:self','personality:novelty:self','personality:conflict_pace:self','personality:directness:self','personality:quiet_comfort:self']) id
   where not exists(select 1 from jsonb_array_elements(items) p where p->>'id'=id
     and p->'needsClarification'='false'::jsonb));
$$;
revoke all on function marriage.interview_required_complete(jsonb) from public,anon,authenticated,service_role;

do $upgrade$ declare definition text;begin
 definition:=pg_get_functiondef('marriage.interview_document_valid(jsonb)'::regprocedure);
 definition:=replace(definition,'''wudayn-interview-1'',''wudayn-interview-2''', '''wudayn-interview-1'',''wudayn-interview-2'',''wudayn-interview-3''');
 definition:=replace(definition,'jsonb_array_length(doc->''turns'')>20','jsonb_array_length(doc->''turns'')>48');
 definition:=replace(definition,'octet_length(doc::text)>196608','octet_length(doc::text)>262144');
 execute definition;
end $upgrade$;
alter function marriage.interview_document_valid(jsonb) rename to interview_document_valid_before_required;
create function marriage.interview_document_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$begin
 if not marriage.interview_document_valid_before_required(doc) then return false;end if;
 if doc->>'promptVersion'<>'wudayn-interview-3' and jsonb_array_length(doc->'turns')>20 then return false;end if;
 if doc->>'promptVersion'='wudayn-interview-3' then
  if exists(select 1 from jsonb_array_elements(doc->'proposals') p where p->>'kind'='beena') then return false;end if;
  if doc->>'status'='confirmed' and not marriage.interview_required_complete(doc->'confirmed') then return false;end if;
 end if;
 return true;
end $$;
revoke all on function marriage.interview_document_valid(jsonb),marriage.interview_document_valid_before_required(jsonb) from public,anon,authenticated,service_role;

create table marriage.interview_receipts(
 owner_key text primary key references marriage.interview_sessions(owner_key) on delete cascade,
 analysis_fingerprint text,
 completed_at timestamptz,
 fallback_at timestamptz,
 fallback_reason text check(fallback_reason in ('unavailable','capacity','interpretation'))
);
alter table marriage.interview_receipts enable row level security;
revoke all on marriage.interview_receipts from public,anon,authenticated,service_role;

create function nisfayn_ai.attest_interview(member_id uuid,test_token text,expected_revision bigint,event text,reason text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner text;s marriage.interview_sessions;receipt marriage.interview_receipts;fingerprint text;actor_name text;begin
 if event not in ('analyzed','complete','fallback') then raise exception 'Invalid assessment event';end if;
 if test_token is not null then
  select t.actor into actor_name from nisfayn_test.sessions t join marriage.admin_test_members m on m.actor=t.actor
   where t.token_hash=sha256(test_token::bytea) and t.expires_at>now() and m.review_status='approved' and not m.suspended and not m.paused and m.access_until>now();
  if actor_name is null then raise exception 'Invalid session';end if;
  owner:='tester:'||actor_name;
 else
  if member_id is null or not exists(select 1 from marriage.members m where m.id=member_id and not m.suspended) then raise exception 'Invalid member';end if;
  owner:='member:'||member_id::text;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('interview:'||owner,0));
 select * into s from marriage.interview_sessions where owner_key=owner and expires_at>now() for update;
 if s.owner_key is null or s.revision<>expected_revision or s.document->>'promptVersion'<>'wudayn-interview-3' then raise exception 'Changed assessment' using errcode='40001';end if;
 fingerprint:=md5(jsonb_build_array(s.document->'turns',s.document->'proposals')::text);
 select * into receipt from marriage.interview_receipts where owner_key=owner;
 if event='analyzed' then
  if s.document->'pendingAnalysis'<>'false'::jsonb then raise exception 'Analysis not complete';end if;
  insert into marriage.interview_receipts(owner_key,analysis_fingerprint) values(owner,fingerprint)
   on conflict(owner_key) do update set analysis_fingerprint=excluded.analysis_fingerprint,completed_at=null;
 elsif event='complete' then
  if receipt.analysis_fingerprint is distinct from fingerprint or s.document->>'status'<>'confirmed'
   or s.document->'pendingAnalysis'<>'false'::jsonb or not marriage.interview_required_complete(s.document->'confirmed') then raise exception 'Unverified assessment';end if;
  update marriage.interview_receipts set completed_at=now() where owner_key=owner;
 else
  if reason not in ('unavailable','capacity','interpretation') or s.document->'pendingAnalysis'<>'true'::jsonb then raise exception 'Invalid fallback';end if;
  insert into marriage.interview_receipts(owner_key,fallback_at,fallback_reason) values(owner,now(),reason)
   on conflict(owner_key) do update set fallback_at=now(),fallback_reason=excluded.fallback_reason,completed_at=null;
 end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.marriage_interview_attest(member_id uuid default null,test_token text default null,expected_revision bigint default null,event text default null,reason text default '') returns jsonb
language sql security invoker set search_path='' as $$select nisfayn_ai.attest_interview($1,$2,$3,$4,$5)$$;
revoke all on function nisfayn_ai.attest_interview(uuid,text,bigint,text,text),public.marriage_interview_attest(uuid,text,bigint,text,text) from public,anon,authenticated,service_role;
grant usage on schema nisfayn_ai to service_role;
grant execute on function nisfayn_ai.attest_interview(uuid,text,bigint,text,text),public.marriage_interview_attest(uuid,text,bigint,text,text) to service_role;

-- Expose only own fallback eligibility; clients cannot grant it by changing JSON.
alter function nisfayn_ai.interview(text,jsonb,text) rename to interview_before_receipts;
create function nisfayn_ai.interview(command text,payload jsonb default '{}',test_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;owner text;actor_name text;begin
 result:=nisfayn_ai.interview_before_receipts(command,payload,test_token);
 if command='reserve' then return result;end if;
 if coalesce(test_token,'')<>'' then
  select actor into actor_name from nisfayn_test.sessions where token_hash=sha256(test_token::bytea) and expires_at>now();
  owner:='tester:'||actor_name;
 else owner:='member:'||marriage.require_member()::text;end if;
 return result||jsonb_build_object('fallbackAvailable',exists(select 1 from marriage.interview_receipts where owner_key=owner and fallback_at is not null));
end $$;
revoke all on function nisfayn_ai.interview(text,jsonb,text),nisfayn_ai.interview_before_receipts(text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function nisfayn_ai.interview(text,jsonb,text) to anon,authenticated;
-- Rebind the public SQL wrapper after renaming its implementation.
create or replace function public.marriage_interview(command text,payload jsonb default '{}',test_token text default null) returns jsonb
language sql security invoker set search_path='' as $$select nisfayn_ai.interview($1,$2,$3)$$;

do $payload$ declare definition text;begin
 definition:=pg_get_functiondef('nisfayn_ai.interview_before_receipts(text,jsonb,text)'::regprocedure);
 definition:=replace(definition,'octet_length(payload::text)>197000','octet_length(payload::text)>270000');execute definition;
end $payload$;

create function marriage.required_onboarding_answers(profile jsonb) returns boolean
language sql immutable set search_path='' as $$
 select profile#>'{signupConsents,assessment}'='true'::jsonb
 and not exists(select 1 from unnest(array['education','marriageIntent','lookingFor','lifeTogether','valuesStatement']) k where length(btrim(coalesce(profile->>k,'')))=0)
 and jsonb_typeof(profile->'marriageBasics')='object'
 and not exists(select 1 from unnest(array['heightCm','weightKg','preferredLanguage','languageOpenness','nationality','maritalStatus','polygynyPreference','childrenCount','smoking','marriageTimeline','meetingPreference']) k where length(btrim(coalesce(profile->'marriageBasics'->>k,'')))=0)
 and jsonb_typeof(profile#>'{marriageBasics,spokenLanguages}')='array' and jsonb_array_length(profile#>'{marriageBasics,spokenLanguages}')>0
 and jsonb_typeof(profile->'partnerCriteria')='object'
 and not exists(select 1 from unnest(array['sharedLanguage','height','weight','nationality','education','profession','maritalStatus','children','smoking']) k where coalesce(profile->'partnerCriteria'->k->>'mode','') not in ('any','prefer','require'))
 and jsonb_typeof(profile->'surveyAnswers')='object'
 and not exists(select 1 from unnest(array['children_plan','partner_children_plan','residence_plan','partner_residence_plan','wife_work','partner_wife_work','marriage_timeline','partner_marriage_timeline','family_boundaries','partner_family_boundaries','shared_budget','partner_shared_budget','household_roles','partner_household_roles','weekly_planning','partner_weekly_planning','social_rhythm','partner_social_rhythm','conversation_initiative_preference','partner_conversation_initiative_preference','match_disagreement_style','partner_match_disagreement_style','repair_after_conflict','partner_repair_after_conflict','conversation_depth','partner_conversation_depth','closeness_pace','partner_closeness_pace','curiosity_style','partner_curiosity_style','early_openness','partner_early_openness']) k where coalesce(profile->'surveyAnswers'->>k,'')='')
 and jsonb_typeof(profile->'personalityAnswers')='object'
 and not exists(select 1 from unnest(array['social_energy','initiative','depth','openness','closeness','reassurance','support','planning','novelty','conflict_pace','directness','quiet_comfort']) k where coalesce(profile->'personalityAnswers'->>k,'') not in ('A','B','C','D','E'));
$$;
revoke all on function marriage.required_onboarding_answers(jsonb) from public,anon,authenticated,service_role;
alter function marriage.apply_profile(jsonb) rename to apply_profile_before_required_assessment;
create function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 perform 1 from marriage.members where id=me for update;
 if not exists(select 1 from marriage.profiles where member_id=me) then
  if payload->>'gender'='man' and not marriage.has_onboarding_portrait(me) then raise exception 'أضف صورة واضحة وتحقّق منها أو أرسلها للمراجعة قبل إرسال ملفك.' using errcode='22023';end if;
  if marriage.required_onboarding_answers(payload) is not true then raise exception 'أكمل جميع إجابات التوافق والشخصية قبل إرسال ملفك.' using errcode='22023';end if;
  if not exists(select 1 from marriage.interview_receipts r join marriage.interview_sessions s using(owner_key)
   where r.owner_key='member:'||me::text and s.expires_at>now() and (r.fallback_at is not null or (r.completed_at is not null and s.document->>'status'='confirmed' and r.analysis_fingerprint=md5(jsonb_build_array(s.document->'turns',s.document->'proposals')::text)))) then
   raise exception 'أكمل جلسة التوافق أولًا. تتاح الأسئلة المباشرة عند تعذّر الجلسة.' using errcode='22023';
  end if;
 end if;
 return marriage.apply_profile_before_required_assessment(payload);
end $$;
revoke all on function marriage.apply_profile_before_required_assessment(jsonb) from public,anon,authenticated,service_role;
revoke all on function marriage.apply_profile(jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.apply_profile(jsonb) to authenticated;
create or replace function public.marriage_apply(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select marriage.apply_profile($1)$$;
-- Preserve the explicit interview choice across draft reloads without treating
-- assessment consent or an older draft as consent to use the interview.
do $draft$ declare definition text;needle text;begin
 definition:=pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
 needle:=$old$k not in('version','sensitiveProfile','assessment')$old$;
 if strpos(definition,needle)=0 then raise exception 'Draft permission allowlist changed';end if;
 definition:=replace(definition,needle,$new$k not in('version','sensitiveProfile','assessment','interview')$new$);
 needle:=$old$or jsonb_typeof(permissions->'sensitiveProfile') is distinct from 'boolean'$old$;
 if strpos(definition,needle)=0 then raise exception 'Draft permission validation changed';end if;
 definition:=replace(definition,needle,$new$or (permissions ? 'interview' and jsonb_typeof(permissions->'interview') is distinct from 'boolean')
  or jsonb_typeof(permissions->'sensitiveProfile') is distinct from 'boolean'$new$);
 execute definition;
end $draft$;
