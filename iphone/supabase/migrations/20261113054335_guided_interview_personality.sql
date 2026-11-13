-- Add reviewed personality interpretations to the existing private interview.
-- No stored sessions, profile answers, permissions, or scoring are rewritten.
-- Both prompt versions remain readable; new output must use canonical self-only answers.
create or replace function marriage.interview_document_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare t jsonb;p jsonb;e jsonb;arr text;begin
 if jsonb_typeof(doc) is distinct from 'object' or octet_length(doc::text)>196608
  or not(doc ?& array['version','consentVersion','model','promptVersion','status','turns','currentQuestion','proposals','readiness','clarifications','confirmed','lastRequestId','lastMode','pendingAnalysis','draftAnswer','reviewSharing','confirmedAt'])
  or exists(select 1 from jsonb_object_keys(doc) k where k not in ('version','consentVersion','model','promptVersion','status','turns','currentQuestion','proposals','readiness','clarifications','confirmed','lastRequestId','lastMode','pendingAnalysis','draftAnswer','reviewSharing','confirmedAt'))
  or doc->>'version' is distinct from 'interview-v1' or doc->>'consentVersion' is distinct from 'wudayn-interview-v1'
  or doc->>'model' is distinct from 'gpt-6-luna' or coalesce(doc->>'promptVersion','') not in ('wudayn-interview-1','wudayn-interview-2')
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
  if jsonb_typeof(doc->arr) is distinct from 'array' or jsonb_array_length(doc->arr)>64 then return false;end if;
  if (select count(*) from jsonb_array_elements(doc->arr))<>(select count(distinct value->>'id') from jsonb_array_elements(doc->arr)) then return false;end if;
  for p in select value from jsonb_array_elements(doc->arr) loop
   if jsonb_typeof(p) is distinct from 'object' or not(p ?& array['id','kind','fieldId','side','values','summary','evidence','needsClarification'])
    or exists(select 1 from jsonb_object_keys(p) k where k not in ('id','kind','fieldId','side','values','summary','evidence','needsClarification'))
    or jsonb_typeof(p->'id') is distinct from 'string' or length(p->>'id') not between 1 and 100
    or coalesce(p->>'kind','') not in ('preference','beena','personality') or coalesce(p->>'side','') not in ('self','partner','importance')
    or jsonb_typeof(p->'fieldId') is distinct from 'string' or length(p->>'fieldId') not between 1 and 80
    or jsonb_typeof(p->'values') is distinct from 'array' or jsonb_array_length(p->'values') not between 1 and 6
    or exists(select 1 from jsonb_array_elements(p->'values') v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 80)
    or jsonb_typeof(p->'summary') is distinct from 'string' or length(p->>'summary') not between 1 and 240
    or jsonb_typeof(p->'needsClarification') is distinct from 'boolean'
    or not marriage.interview_evidence_valid(doc,p->'evidence') then return false;end if;
   if p->>'kind'='personality' and (
    p->>'side' is distinct from 'self'
    or p->>'fieldId' not in ('social_energy','initiative','depth','openness','closeness','reassurance',
      'support','planning','novelty','conflict_pace','directness','quiet_comfort')
    or jsonb_array_length(p->'values')<>1
    or (p->'values'->>0) not in ('A','B','C','D','E')
   ) then return false;end if;
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
revoke all on function marriage.interview_document_valid(jsonb) from public,anon,authenticated,service_role;
