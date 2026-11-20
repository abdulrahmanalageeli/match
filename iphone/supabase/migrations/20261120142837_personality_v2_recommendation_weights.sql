-- Optional partner ranges share the existing private answer store and consent boundary.
insert into marriage.personality_questions(code,ordinal) values
 ('partner_stability',28),('partner_reliability',29),('partner_warmth',30),
 ('partner_social_energy',31),('partner_openness',32);

create or replace function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if version is distinct from 'personality-v2' then
   return marriage.normalize_marriage_extras_v1(basics,criteria,personality,version);
 end if;
 if jsonb_typeof(personality) is distinct from 'object' or exists(
   select 1 from jsonb_each(personality) p where not case
     when p.key in ('partner_stability','partner_reliability','partner_warmth','partner_social_energy','partner_openness')
       then p.value in ('"A"'::jsonb,'"C"'::jsonb,'"E"'::jsonb)
     else coalesce((marriage.assessment_fields_v4()->('personality:'||p.key||':self')) ? (p.value#>>'{}'),false)
   end
 ) then raise exception 'Invalid personality-v2 answer' using errcode='22023'; end if;
 return marriage.normalize_marriage_extras_v1(basics,criteria,'{}','personality-v1')
   || jsonb_build_object('personalityAnswers',personality,'personalityVersion',version);
end $$;

create function marriage.reciprocal_trait_fit(a uuid,b uuid)
returns double precision language sql stable security invoker set search_path='' as $$
 with items(code,domain,reverse_key) as (values
   ('calm_before_acting','stability',false),('lasting_tension','stability',true),('stress_recovery','stability',false),
   ('follow_through','reliability',false),('prepare_early','reliability',false),('unfinished_tasks','reliability',true),
   ('perspective_taking','warmth',false),('make_amends','warmth',false),('harsh_words','warmth',true),
   ('group_energy','social_energy',false),('start_conversation','social_energy',false),('quiet_settings','social_energy',true),
   ('try_new_ideas','openness',false),('explore_views','openness',false),('prefer_familiar','openness',true)
 ), traits as (
   select p.member_id,i.domain,sum(case when i.reverse_key then 70-ascii(p.option_code) else ascii(p.option_code)-64 end) as points
   from marriage.personality_answers p join items i on i.code=p.question_code
   join marriage.member_assessment m on m.member_id=p.member_id and m.version='marriage-v4'
   where p.member_id in (a,b) group by p.member_id,i.domain having count(*)=3
 ), ranges(code,lo,hi) as (values ('A',3,6),('C',6,12),('E',12,15)),
 directions as (
   select p.member_id,1-sum(greatest(0,r.lo-t.points,t.points-r.hi))::float8/(9*count(*)) as fit
   from traits t join marriage.personality_answers p
     on p.member_id=case when t.member_id=a then b else a end and p.question_code='partner_'||t.domain
   join ranges r on r.code=p.option_code group by p.member_id
 )
 select case when count(*)=2 and (select count(*) from traits)=10 then sqrt(min(fit)*max(fit)) end from directions
$$;
revoke all on function marriage.reciprocal_trait_fit(uuid,uuid) from public,anon,authenticated,service_role;

-- Preserve the weighted practical fit, personality similarity and legacy Beena adjustment.
create or replace function marriage.pair_fit(a uuid,b uuid)
returns table(fit jsonb,rank_value float8,covered integer,shared integer,provisional boolean)
language sql stable set search_path='' as $$
 with contract as materialized (select marriage.pair_contract(a,b)='marriage-v4' as current),
 base as (
   select v4.* from contract cross join lateral marriage.current_practical_fit(a,b) v4 where current
   union all
   select v3.* from contract cross join lateral marriage.pair_fit_before_beena(a,b) v3 where not current
 ), comparison as materialized (
   select marriage.compare_beena(marriage.beena_json(a),marriage.beena_json(b)) as value,
          case when (select current from contract) then marriage.reciprocal_trait_fit(a,b) end as trait
 )
 select case when base.fit->'personality'='null'::jsonb then base.fit-'personality' else base.fit end
   || jsonb_build_object('beena',comparison.value,'preferenceEvidence',marriage.preference_evidence(a,b))
   || jsonb_strip_nulls(jsonb_build_object('partnerPersonalityFit',floor(100*comparison.trait+0.5)::int)),
   base.rank_value*case when base.fit->>'version'='marriage-v3' and (comparison.value->>'complete')::boolean
     then .95+(comparison.value->>'percentage')::float8/1000 else 1 end * coalesce(0.98+0.04*comparison.trait,1),
   base.covered,base.shared,base.provisional
 from base cross join comparison
$$;
