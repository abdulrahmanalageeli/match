-- Keep explanation order identical to the versioned phone questionnaire.
-- Temporarily negate ordinals to avoid the immediate unique constraint while
-- moving wife_work into the plans section; answers and preferences are untouched.
update marriage.fit_dimensions set ordinal=-ordinal;
update marriage.fit_dimensions d set ordinal=entry.position
from marriage.assessment_versions v,
 jsonb_array_elements(v.catalog->'dimensions') with ordinality as entry(value,position)
where v.id='marriage-v2' and d.code=entry.value->>'id';

-- A full set of answers alone does not upgrade a member's assessment version.
-- Match the phone: both members must have completed the current questionnaire.
do $parity$ declare definition text; begin
 definition:=pg_get_functiondef('marriage.pair_fit(uuid,uuid)'::regprocedure);
 if strpos(definition,$old$version in('marriage-v1','marriage-v2')$old$)=0 then
  raise exception 'Unexpected pair_fit definition: assessment version gate is missing';
 end if;
 execute replace(definition,$old$version in('marriage-v1','marriage-v2')$old$,$new$version='marriage-v2'$new$);
end $parity$;
