-- Keep stored consent fingerprints intact. The legacy partner residence answer
-- can still exist on early v4 profiles, but has no bearing on current completion.
create or replace function marriage.deep_complete(target uuid) returns boolean
language sql stable set search_path='' as $$
 with evidence as (select marriage.deep_evidence(target) as doc),
 counts as (
  select count(*) filter(where starts_with(e->>'key','answer:')) practical,
   count(*) filter(where e->>'key'='answer:partner_residence_plan') partner_residence,
   count(*) filter(where starts_with(e->>'key','personality:')) personality
  from evidence,jsonb_array_elements(doc->'entries') e
 )
 select case doc->>'assessmentVersion' when 'marriage-v4' then
  practical-partner_residence=2*(select count(*) from marriage.pair_dimensions(target,target))-1
  and personality=15
 else coalesce(doc->>'assessmentVersion' in ('marriage-v2','marriage-v3') and practical=32 and personality=12,false) end
 from evidence,counts
$$;
revoke all on function marriage.deep_complete(uuid) from public,anon,authenticated,service_role;
