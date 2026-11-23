-- Private, transcript-grounded notes remain outside matching and the review projection.
alter function marriage.interview_document_valid(jsonb) rename to interview_document_valid_before_statements;

create function marriage.interview_document_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  item jsonb;
  source_position bigint;
begin
  if not marriage.interview_document_valid_before_statements(doc - 'statements') then return false; end if;
  if not (doc ? 'statements') then return true; end if;
  if jsonb_typeof(doc->'statements') is distinct from 'array' or jsonb_array_length(doc->'statements') > 40 then return false; end if;
  for item in select value from jsonb_array_elements(doc->'statements') loop
    if jsonb_typeof(item) is distinct from 'object' or
       not (item ?& array['subject','topic','turnId','quote']) or
       (item - array['subject','topic','turnId','quote','replacesQuote']) <> '{}'::jsonb or
       coalesce(item->>'subject','') not in ('self','partner','intent') or
       coalesce(item->>'topic','') not in ('social','description','interest','seriousness','age','height','appearance','skinTone','timeline','nextStep','other') or
       jsonb_typeof(item->'turnId') is distinct from 'string' or jsonb_typeof(item->'quote') is distinct from 'string' or
       length(btrim(item->>'quote')) = 0 or length(item->>'quote') > 180 or
       strpos(item->>'quote','[تفصيل حساس محجوب]') > 0 then return false; end if;
    select t.pos into source_position from jsonb_array_elements(doc->'turns') with ordinality as t(value,pos)
     where t.value->>'id'=item->>'turnId' and t.value->'skipped'='false'::jsonb
       and strpos(t.value->>'answer',item->>'quote')>0;
    if source_position is null then return false; end if;
    if item ? 'replacesQuote' and (
      jsonb_typeof(item->'replacesQuote') is distinct from 'string' or length(btrim(item->>'replacesQuote'))=0 or
      length(item->>'replacesQuote')>180 or not exists(
        select 1 from jsonb_array_elements(doc->'turns') with ordinality as t(value,pos)
         where t.pos<source_position and t.value->'skipped'='false'::jsonb and strpos(t.value->>'answer',item->>'replacesQuote')>0
      )
    ) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function marriage.interview_document_valid(jsonb),
 marriage.interview_document_valid_before_statements(jsonb) from public,anon,authenticated,service_role;

-- Reuse the existing owner, revision, row lock, expiry, catalog version and service-only permission.
-- A refinement advances an existing analysis receipt by precisely one allowed transcript turn.
do $migration$
declare
  original text := pg_get_functiondef('nisfayn_ai.attest_interview(uuid,text,bigint,text,text)'::regprocedure);
  updated text;
  anchor text := 'if event=''analyzed'' then';
begin
  updated := replace(original, 'event not in (''analyzed'',''complete'',''fallback'')',
    'event not in (''analyzed'',''complete'',''fallback'',''refined'')');
  if updated=original or strpos(updated,anchor)=0 then raise exception 'Unexpected interview attestation definition'; end if;
  updated := replace(updated,anchor,$branch$
  if event='refined' then
    if expected_revision is null or s.document->>'status' is distinct from 'review'
       or s.document->>'lastMode' is distinct from 'luna' or s.document->'pendingAnalysis' is distinct from 'false'::jsonb
       or jsonb_array_length(s.document->'turns')<2
       or s.document#>>'{turns,-1,topic}' is distinct from 'intent'
       or s.document#>'{turns,-1,skipped}' is distinct from 'false'::jsonb
       or coalesce(s.document#>>'{turns,-1,question}','') not in (
         'وش نطاق الطول اللي يناسبك في الشريك، إذا عندك طول معيّن في بالك؟',
         'وش نطاق العمر اللي يناسبك في الشريك، إذا عندك عمر معيّن في بالك؟',
         'أي مدة تقريبًا تقصد لإتمام الزواج؟')
    then raise exception 'Invalid interview refinement'; end if;
    if receipt.analysis_fingerprint = fingerprint then return jsonb_build_object('ok',true); end if;
    if receipt.analysis_fingerprint is distinct from md5(jsonb_build_array(
        (s.document->'turns') - (-1),s.document->'proposals')::text)
    then raise exception 'Unverified refinement base'; end if;
    update marriage.interview_receipts set analysis_fingerprint=fingerprint,completed_at=null where owner_key=owner;
  elsif event='analyzed' then
  $branch$);
  execute updated;
end $migration$;
