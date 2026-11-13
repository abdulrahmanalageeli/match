-- Private, consented interview drafts. These are member-owned, self-reported
-- answers, never identity verification, admission decisions or public profiles.
create sequence marriage.interview_revision_seq;
revoke all on sequence marriage.interview_revision_seq from public,anon,authenticated,service_role;
create table marriage.interview_sessions (
 owner_key text primary key,
 member_id uuid unique references marriage.members(id) on delete cascade,
 actor text unique check(actor in ('abdulrahman','reham')),
 document jsonb not null,
 revision bigint not null default nextval('marriage.interview_revision_seq'),
 consent_version text not null check(consent_version='wudayn-interview-v1'),
 consented_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days',
 check((member_id is not null and actor is null) or (member_id is null and actor is not null)),
 check(jsonb_typeof(document)='object' and octet_length(document::text)<=196608)
);
create index interview_sessions_expiry on marriage.interview_sessions(expires_at);
alter table marriage.interview_sessions enable row level security;
revoke all on marriage.interview_sessions from public,anon,authenticated,service_role;
create table marriage.interview_usage (
 id bigint generated always as identity primary key,
 owner_key text not null,
 member_id uuid references marriage.members(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index interview_usage_owner_recent on marriage.interview_usage(owner_key,created_at);
create index interview_usage_recent on marriage.interview_usage(created_at);
alter table marriage.interview_usage enable row level security;
revoke all on marriage.interview_usage from public,anon,authenticated,service_role;

create function marriage.interview_evidence_valid(doc jsonb,evidence jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare e jsonb;begin
 if jsonb_typeof(evidence) is distinct from 'array' or jsonb_array_length(evidence) not between 1 and 3 then return false;end if;
 for e in select value from jsonb_array_elements(evidence) loop
  if jsonb_typeof(e) is distinct from 'object' or not(e ?& array['turnId','quote'])
   or exists(select 1 from jsonb_object_keys(e) k where k not in ('turnId','quote'))
   or jsonb_typeof(e->'turnId') is distinct from 'string' or length(e->>'turnId') not between 1 and 100
   or jsonb_typeof(e->'quote') is distinct from 'string' or length(btrim(e->>'quote')) not between 1 and 240
   or not exists(select 1 from jsonb_array_elements(doc->'turns') t where t->>'id'=e->>'turnId'
     and t->'skipped'='false'::jsonb and strpos(t->>'answer',e->>'quote')>0) then return false;end if;
 end loop;
 return true;
 exception when others then return false;
end $$;

create function marriage.interview_document_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare t jsonb;p jsonb;e jsonb;arr text;begin
 if jsonb_typeof(doc) is distinct from 'object' or octet_length(doc::text)>196608
  or not(doc ?& array['version','consentVersion','model','promptVersion','status','turns','currentQuestion','proposals','readiness','clarifications','confirmed','lastRequestId','lastMode','pendingAnalysis','draftAnswer','reviewSharing','confirmedAt'])
  or exists(select 1 from jsonb_object_keys(doc) k where k not in ('version','consentVersion','model','promptVersion','status','turns','currentQuestion','proposals','readiness','clarifications','confirmed','lastRequestId','lastMode','pendingAnalysis','draftAnswer','reviewSharing','confirmedAt'))
  or doc->>'version' is distinct from 'interview-v1' or doc->>'consentVersion' is distinct from 'wudayn-interview-v1'
  or doc->>'model' is distinct from 'gpt-6-luna' or doc->>'promptVersion' is distinct from 'wudayn-interview-1'
  or coalesce(doc->>'status','') not in ('active','review','confirmed')
  or coalesce(doc->>'lastMode','') not in ('luna','guided')
  or jsonb_typeof(doc->'pendingAnalysis') is distinct from 'boolean' or jsonb_typeof(doc->'reviewSharing') is distinct from 'boolean'
  or jsonb_typeof(doc->'draftAnswer') is distinct from 'string' or length(doc->>'draftAnswer')>1200
  or (doc->'confirmedAt'<>'null'::jsonb and (jsonb_typeof(doc->'confirmedAt')<>'string' or length(doc->>'confirmedAt')>50))
  or (doc->'lastRequestId'<>'null'::jsonb and (jsonb_typeof(doc->'lastRequestId')<>'string' or length(doc->>'lastRequestId') not between 1 and 100))
  or jsonb_typeof(doc->'turns') is distinct from 'array' or jsonb_array_length(doc->'turns')>20 then return false;end if;
 if (select count(*) from jsonb_array_elements(doc->'turns'))<>(select count(distinct value->>'id') from jsonb_array_elements(doc->'turns')) then return false;end if;
 for t in select value from jsonb_array_elements(doc->'turns') loop
  if jsonb_typeof(t) is distinct from 'object' or not(t ?& array['id','topic','question','answer','skipped'])
   or exists(select 1 from jsonb_object_keys(t) k where k not in ('id','topic','question','answer','skipped'))
   or jsonb_typeof(t->'id') is distinct from 'string' or length(t->>'id') not between 1 and 100
   or jsonb_typeof(t->'topic') is distinct from 'string' or length(t->>'topic') not between 1 and 64
   or jsonb_typeof(t->'question') is distinct from 'string' or length(t->>'question') not between 1 and 500
   or jsonb_typeof(t->'answer') is distinct from 'string' or length(t->>'answer')>1200
   or jsonb_typeof(t->'skipped') is distinct from 'boolean'
   or (t->'skipped'='false'::jsonb and length(btrim(t->>'answer'))=0) then return false;end if;
 end loop;
 p:=doc->'currentQuestion';
 if p<>'null'::jsonb then
  if jsonb_typeof(p) is distinct from 'object' or not(p ?& array['topic','text','suggestions'])
   or exists(select 1 from jsonb_object_keys(p) k where k not in ('topic','text','suggestions'))
   or jsonb_typeof(p->'topic') is distinct from 'string' or length(p->>'topic') not between 1 and 64
   or jsonb_typeof(p->'text') is distinct from 'string' or length(p->>'text') not between 1 and 500
   or jsonb_typeof(p->'suggestions') is distinct from 'array' or jsonb_array_length(p->'suggestions')>4
   or exists(select 1 from jsonb_array_elements(p->'suggestions') s where jsonb_typeof(s)<>'string' or length(s#>>'{}') not between 1 and 120) then return false;end if;
 end if;
 foreach arr in array array['proposals','confirmed'] loop
  if jsonb_typeof(doc->arr) is distinct from 'array' or jsonb_array_length(doc->arr)>50 then return false;end if;
  if (select count(*) from jsonb_array_elements(doc->arr))<>(select count(distinct value->>'id') from jsonb_array_elements(doc->arr)) then return false;end if;
  for p in select value from jsonb_array_elements(doc->arr) loop
   if jsonb_typeof(p) is distinct from 'object' or not(p ?& array['id','kind','fieldId','side','values','summary','evidence','needsClarification'])
    or exists(select 1 from jsonb_object_keys(p) k where k not in ('id','kind','fieldId','side','values','summary','evidence','needsClarification'))
    or jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 100
    or coalesce(p->>'kind','') not in ('preference','beena') or coalesce(p->>'side','') not in ('self','partner','importance')
    or jsonb_typeof(p->'fieldId') is distinct from 'string' or length(p->>'fieldId') not between 1 and 80
    or jsonb_typeof(p->'values') is distinct from 'array' or jsonb_array_length(p->'values') not between 1 and 6
    or exists(select 1 from jsonb_array_elements(p->'values') v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 80)
    or jsonb_typeof(p->'summary') is distinct from 'string' or length(p->>'summary') not between 1 and 240
    or jsonb_typeof(p->'needsClarification') is distinct from 'boolean'
    or not marriage.interview_evidence_valid(doc,p->'evidence') then return false;end if;
  end loop;
 end loop;
 foreach arr in array array['readiness','clarifications'] loop
  if jsonb_typeof(doc->arr) is distinct from 'array' or jsonb_array_length(doc->arr)>(case when arr='readiness' then 4 else 6 end) then return false;end if;
  for p in select value from jsonb_array_elements(doc->arr) loop
   if jsonb_typeof(p) is distinct from 'object' or not(p ?& array['id','text','evidence'])
    or exists(select 1 from jsonb_object_keys(p) k where k not in ('id','text','evidence'))
    or jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 100
    or (arr='readiness' and p->>'id' not in ('timeline','preparation','nextStep','discussionPoints'))
    or jsonb_typeof(p->'text') is distinct from 'string' or length(p->>'text') not between 1 and 360
    or not marriage.interview_evidence_valid(doc,p->'evidence') then return false;end if;
  end loop;
 end loop;
 return true;
 exception when others then return false;
end $$;
revoke all on function marriage.interview_evidence_valid(jsonb,jsonb),marriage.interview_document_valid(jsonb) from public,anon,authenticated,service_role;

create function nisfayn_ai.interview(command text,payload jsonb,test_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid;actor_name text;owner text;s marriage.interview_sessions;doc jsonb;today timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 empty_result jsonb:='{"document":null,"revision":0,"updatedAt":null,"expiresAt":null}';
begin
 if command is null or command not in ('load','start','save','delete','reserve') or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>197000 then raise exception 'طلب الجلسة غير صالح.' using errcode='22023';end if;
 if coalesce(test_token,'')<>'' then
  if test_token !~ '^[0-9a-f]{64}$' then raise exception 'يلزم تسجيل الدخول.' using errcode='42501';end if;
  select t.actor into actor_name from nisfayn_test.sessions t join marriage.admin_test_members m on m.actor=t.actor
   where t.token_hash=sha256(test_token::bytea) and t.expires_at>now() and m.review_status='approved' and not m.suspended and not m.paused and m.access_until>now();
  if actor_name is null then raise exception 'انتهت جلسة الدخول.' using errcode='42501';end if;
  owner:='tester:'||actor_name;
 else
  me:=marriage.require_member();
  -- A suspended account with a live Auth session may still retrieve or erase
  -- its private interview and withdraw optional summary sharing.
  if command not in ('load','delete') and exists(select 1 from marriage.members where id=me and suspended) then raise exception 'الحساب غير متاح.' using errcode='42501';end if;
  owner:='member:'||me::text;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('interview:'||owner,0));
 delete from marriage.interview_sessions where owner_key=owner and expires_at<=now();
 select * into s from marriage.interview_sessions where owner_key=owner for update;
 if command='load' then
  if not found then return empty_result;end if;
 elsif command='start' then
  if payload->>'consentVersion' is distinct from 'wudayn-interview-v1' then raise exception 'راجع الموافقة على معالجة الجلسة.' using errcode='22023';end if;
  if s.owner_key is null then
   doc:=payload->'document';
   if not marriage.interview_document_valid(doc) or doc->>'status'<>'active' or doc->'reviewSharing'<>'false'::jsonb
    or doc->'confirmedAt'<>'null'::jsonb or jsonb_array_length(doc->'turns')<>0 or jsonb_array_length(doc->'confirmed')<>0
    or jsonb_array_length(doc->'proposals')<>0 or jsonb_array_length(doc->'readiness')<>0 or jsonb_array_length(doc->'clarifications')<>0 then raise exception 'بيانات الجلسة غير صالحة.' using errcode='22023';end if;
   insert into marriage.interview_sessions(owner_key,member_id,actor,document,consent_version)
    values(owner,me,actor_name,doc,'wudayn-interview-v1') returning * into s;
  end if;
 else
  if s.owner_key is null then
   if command='delete' and payload->'expectedRevision'='0'::jsonb then return empty_result;end if;
   raise exception 'انتهت الجلسة، افتحها من جديد.' using errcode='40001';
  end if;
  if jsonb_typeof(payload->'expectedRevision') is distinct from 'number' or payload->>'expectedRevision' is distinct from s.revision::text then raise exception 'تغيرت الجلسة في نافذة أخرى. أعد تحميلها.' using errcode='40001';end if;
  if command='delete' then
   delete from marriage.interview_sessions where owner_key=owner;return empty_result;
  elsif command='reserve' then
   -- Usage outlives individual interviews, preventing delete/restart quota resets.
   perform pg_advisory_xact_lock(723906712);
   delete from marriage.interview_usage where created_at<now()-interval '7 days';
   if (select count(*) from marriage.interview_usage where owner_key=owner and created_at>=today)>=40
    or (select count(*) from marriage.interview_usage where owner_key=owner and created_at>now()-interval '1 minute')>=6
    or (select count(*) from marriage.interview_usage where created_at>=today)>=2000 then return jsonb_build_object('status','limited','revision',s.revision);end if;
   insert into marriage.interview_usage(owner_key,member_id) values(owner,me);
   return jsonb_build_object('status','allowed','revision',s.revision);
  elsif command='save' then
   doc:=payload->'document';
   if not marriage.interview_document_valid(doc) then raise exception 'بيانات الجلسة غير صالحة.' using errcode='22023';end if;
   doc:=jsonb_set(doc,'{confirmedAt}',case when doc->>'status'='confirmed' then
     case when s.document->>'status'='confirmed' and s.document->'confirmedAt'<>'null'::jsonb then s.document->'confirmedAt' else to_jsonb(now()) end else 'null'::jsonb end);
   update marriage.interview_sessions set document=doc,revision=nextval('marriage.interview_revision_seq'),updated_at=now(),expires_at=now()+interval '30 days'
    where owner_key=owner returning * into s;
  end if;
 end if;
 return jsonb_build_object('document',s.document,'revision',s.revision,'updatedAt',s.updated_at,'expiresAt',s.expires_at);
end $$;
create function public.marriage_interview(command text,payload jsonb default '{}',test_token text default null) returns jsonb
language sql security invoker set search_path='' as $$select nisfayn_ai.interview($1,$2,$3)$$;
revoke all on function nisfayn_ai.interview(text,jsonb,text),public.marriage_interview(text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function nisfayn_ai.interview(text,jsonb,text),public.marriage_interview(text,jsonb,text) to anon,authenticated;

-- Optional summary sharing is deliberately separate from the interview record.
-- Only membership reviewers with live AAL2 sessions may read this projection.
create function marriage.interview_admin_summary(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer']);s marriage.interview_sessions;result jsonb;
begin
 select * into s from marriage.interview_sessions where member_id=target and expires_at>now()
  and document->>'status'='confirmed' and document->'reviewSharing'='true'::jsonb;
 if not found then return null;end if;
 result:=jsonb_build_object('confirmedAt',s.document->'confirmedAt','updatedAt',s.updated_at,'selfReported',true,
  'readiness',coalesce((select jsonb_agg(jsonb_build_object('id',r->>'id','text',r->>'text')) from jsonb_array_elements(s.document->'readiness') r),'[]'::jsonb),
  'clarifications',coalesce((select jsonb_agg(jsonb_build_object('id',r->>'id','text',r->>'text')) from jsonb_array_elements(s.document->'clarifications') r),'[]'::jsonb));
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
  values(staff.user_id,staff.display_name,staff.role,'interview_summary_viewed','member',target,'Member-consented self-reported readiness summary');
 return result;
end $$;
create function public.marriage_interview_admin_summary(member uuid) returns jsonb
language sql security invoker set search_path='' as $$select marriage.interview_admin_summary($1)$$;
revoke all on function marriage.interview_admin_summary(uuid),public.marriage_interview_admin_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.interview_admin_summary(uuid),public.marriage_interview_admin_summary(uuid) to authenticated;

alter function marriage.operations_cleanup() rename to operations_cleanup_before_luna_interview;
create function marriage.operations_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;n integer;begin
 result:=marriage.operations_cleanup_before_luna_interview();
 delete from marriage.interview_sessions where expires_at<=now();get diagnostics n=row_count;
 delete from marriage.interview_usage where created_at<now()-interval '7 days';
 return result||jsonb_build_object('expiredInterviews',n);
end $$;
revoke all on function marriage.operations_cleanup(),marriage.operations_cleanup_before_luna_interview() from public,anon,authenticated,service_role;
grant execute on function marriage.operations_cleanup() to service_role;

alter function marriage.personal_data() rename to personal_data_before_luna_interview;
create function marriage.personal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();result jsonb;interview jsonb;begin
 result:=marriage.personal_data_before_luna_interview();
 select jsonb_build_object('document',s.document,'updatedAt',s.updated_at,'expiresAt',s.expires_at,'consentedAt',s.consented_at,'consentVersion',s.consent_version)
 into interview from marriage.interview_sessions s where member_id=me and expires_at>now();
 return result||jsonb_build_object('compatibilityInterview',interview);
end $$;
revoke all on function marriage.personal_data(),marriage.personal_data_before_luna_interview() from public,anon,authenticated,service_role;
grant execute on function marriage.personal_data() to authenticated;
