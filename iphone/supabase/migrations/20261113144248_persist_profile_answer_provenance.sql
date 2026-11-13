-- Private, versioned provenance for the structured profile fields confirmed at
-- signup. It is never joined into discovery/member cards.
create table marriage.profile_answer_provenance (
 id bigint generated always as identity primary key,
 member_id uuid not null references marriage.members(id) on delete cascade,
 field_id text not null check(length(field_id) between 1 and 100 and field_id ~ '^[A-Za-z0-9_.]+$'),
 revision integer not null check(revision > 0),
 source text not null check(source in ('luna_confirmed','manual')),
 value jsonb not null check(jsonb_typeof(value)='object' and octet_length(value::text)<=4000),
 evidence jsonb not null check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=3 and octet_length(evidence::text)<=2000),
 confidence numeric(4,3) not null check(confidence between 0 and 1),
 confidence_basis text not null check(confidence_basis in ('member_confirmed','member_entered')),
 schema_version text not null check(schema_version='profile-provenance-v1'),
 model_version text check(model_version is null or model_version='gpt-6-luna'),
 prompt_version text check(prompt_version is null or length(prompt_version) between 1 and 80),
 confirmed_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 superseded_at timestamptz,
 unique(member_id,field_id,revision)
);
create unique index profile_answer_provenance_current on marriage.profile_answer_provenance(member_id,field_id) where superseded_at is null;
create index profile_answer_provenance_member on marriage.profile_answer_provenance(member_id,recorded_at desc);
alter table marriage.profile_answer_provenance enable row level security;
revoke all on marriage.profile_answer_provenance from public,anon,authenticated,service_role;
revoke all on sequence marriage.profile_answer_provenance_id_seq from public,anon,authenticated,service_role;

alter function marriage.apply_profile(jsonb) rename to apply_profile_before_answer_provenance;
create function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me uuid:=marriage.require_member();
 provenance jsonb:=payload->'_answerProvenance';
 item jsonb;
 result jsonb;
 current_row marriage.profile_answer_provenance;
 next_revision integer;
 evidence_item jsonb;
begin
 if provenance is not null and (jsonb_typeof(provenance)<>'array' or jsonb_array_length(provenance)>80 or octet_length(provenance::text)>100000) then
  raise exception 'بيانات مصدر الإجابات غير صالحة.' using errcode='22023';
 end if;
 result:=marriage.apply_profile_before_answer_provenance(payload-'_answerProvenance');
 if provenance is null then return result;end if;

 for item in select value from jsonb_array_elements(provenance) loop
  if jsonb_typeof(item)<>'object'
   or exists(select 1 from jsonb_object_keys(item) key where key not in('fieldId','source','value','evidence','confidence','confidenceBasis','schemaVersion','modelVersion','promptVersion','confirmedAt'))
   or coalesce(item->>'fieldId','') !~ '^[A-Za-z0-9_.]{1,100}$'
   or coalesce(item->>'source','') not in('luna_confirmed','manual')
   or jsonb_typeof(item->'value') is distinct from 'object'
   or octet_length((item->'value')::text)>4000
   or jsonb_typeof(item->'evidence') is distinct from 'array'
   or jsonb_array_length(item->'evidence')>3 or octet_length((item->'evidence')::text)>2000
   or jsonb_typeof(item->'confidence') not in('number') or (item->>'confidence')::numeric not between 0 and 1
   or coalesce(item->>'confidenceBasis','') not in('member_confirmed','member_entered')
   or item->>'schemaVersion'<>'profile-provenance-v1'
   or coalesce(item->>'modelVersion','') not in('','gpt-6-luna')
   or length(coalesce(item->>'promptVersion',''))>80
   or coalesce(item->>'confirmedAt','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
   or (item->>'source'='manual' and (jsonb_array_length(item->'evidence')<>0 or item->>'modelVersion' is not null or item->>'promptVersion' is not null))
   or (item->>'source'='luna_confirmed' and (jsonb_array_length(item->'evidence')=0 or item->>'modelVersion'<>'gpt-6-luna' or coalesce(item->>'promptVersion','')='')) then
   raise exception 'بيانات مصدر الإجابات غير صالحة.' using errcode='22023';
  end if;
  for evidence_item in select value from jsonb_array_elements(item->'evidence') loop
   if jsonb_typeof(evidence_item)<>'object' or coalesce(evidence_item->>'turnId','')='' or length(evidence_item->>'turnId')>100
    or coalesce(evidence_item->>'quote','')='' or length(evidence_item->>'quote')>240 then
    raise exception 'دليل الإجابة غير صالح.' using errcode='22023';
   end if;
  end loop;

  select * into current_row from marriage.profile_answer_provenance
   where member_id=me and field_id=item->>'fieldId' and superseded_at is null for update;
  if found and current_row.source=item->>'source' and current_row.value=item->'value' and current_row.evidence=item->'evidence'
   and current_row.confidence=(item->>'confidence')::numeric and current_row.confidence_basis=item->>'confidenceBasis'
   and coalesce(current_row.model_version,'')=coalesce(item->>'modelVersion','') and coalesce(current_row.prompt_version,'')=coalesce(item->>'promptVersion','') then
   continue;
  end if;
  if found then
   update marriage.profile_answer_provenance set superseded_at=now() where id=current_row.id;
   next_revision:=current_row.revision+1;
  else
   select coalesce(max(revision),0)+1 into next_revision from marriage.profile_answer_provenance where member_id=me and field_id=item->>'fieldId';
  end if;
  insert into marriage.profile_answer_provenance(member_id,field_id,revision,source,value,evidence,confidence,confidence_basis,schema_version,model_version,prompt_version,confirmed_at)
  values(me,item->>'fieldId',next_revision,item->>'source',item->'value',item->'evidence',(item->>'confidence')::numeric,item->>'confidenceBasis',item->>'schemaVersion',item->>'modelVersion',item->>'promptVersion',(item->>'confirmedAt')::timestamptz);
 end loop;
 return result;
end $$;
revoke all on function marriage.apply_profile_before_answer_provenance(jsonb),marriage.apply_profile(jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.apply_profile(jsonb) to authenticated;

-- Make provenance portable to the member without exposing it in app state.
alter function marriage.personal_data() rename to personal_data_before_answer_provenance;
create function marriage.personal_data() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();result jsonb;history jsonb;
begin
 result:=marriage.personal_data_before_answer_provenance();
 select coalesce(jsonb_agg(jsonb_build_object('fieldId',field_id,'revision',revision,'source',source,'value',value,'evidence',evidence,
  'confidence',confidence,'confidenceBasis',confidence_basis,'schemaVersion',schema_version,'modelVersion',model_version,
  'promptVersion',prompt_version,'confirmedAt',confirmed_at,'recordedAt',recorded_at,'supersededAt',superseded_at) order by field_id,revision),'[]'::jsonb)
 into history from marriage.profile_answer_provenance where member_id=me;
 return result||jsonb_build_object('profileAnswerProvenance',history);
end $$;
revoke all on function marriage.personal_data_before_answer_provenance(),marriage.personal_data() from public,anon,authenticated,service_role;
grant execute on function marriage.personal_data() to authenticated;
