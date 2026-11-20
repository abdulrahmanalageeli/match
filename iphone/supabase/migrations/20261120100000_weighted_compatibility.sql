-- Apply the scoring revision to current assessments while retaining archived instrument behavior.
create function marriage.current_topic_weights() returns table(code text, weight integer)
language sql immutable set search_path='' as $$
 values
  ('children_plan',10),
  ('residence_plan',8),
  ('wife_work',7),
  ('marriage_timeline',3),
  ('family_authority',7),
  ('financial_provision',8),
  ('domestic_labor',7),
  ('housing_arrangement',7),
  ('social_rhythm',3),
  ('social_boundaries',2),
  ('conflict_response',8),
  ('repair_after_conflict',8),
  ('faith_routine',6),
  ('closeness_pace',4),
  ('money_management',5),
  ('parenting_approach',7)
$$;
revoke all on function marriage.current_topic_weights() from public,anon,authenticated,service_role;

-- Keep the catalog returned by the API consistent with the weights used to score it.
with dimensions as (
 select jsonb_agg(item || jsonb_build_object('weight',w.weight) order by ordinal) as data
 from marriage.assessment_versions v
 cross join lateral jsonb_array_elements(v.catalog->'dimensions') with ordinality d(item,ordinal)
 join marriage.current_topic_weights() w on w.code=item->>'id'
 where v.id='marriage-v4'
), category_totals as (
 select item->>'category' as category,sum((item->>'weight')::integer) as weight
 from dimensions cross join lateral jsonb_array_elements(data) item group by item->>'category'
), categories as (
 select jsonb_agg(item || jsonb_build_object('weight',t.weight) order by ordinal) as data
 from marriage.assessment_versions v
 cross join lateral jsonb_array_elements(v.catalog->'categories') with ordinality c(item,ordinal)
 join category_totals t on t.category=item->>'id'
 where v.id='marriage-v4'
)
update marriage.assessment_versions v
 set catalog=v.catalog||jsonb_build_object('dimensions',dimensions.data,'categories',categories.data)
 from dimensions,categories where v.id='marriage-v4';

-- The mean of the 15 item similarities gives equal weight to the five three-item domains.
create function marriage.current_personality_fit(a uuid,b uuid) returns jsonb
language sql stable set search_path='' as $$
 with domain_questions(domain_id,domain_order,code) as (values
  ('stability',1,'calm_before_acting'),('stability',1,'lasting_tension'),('stability',1,'stress_recovery'),
  ('reliability',2,'follow_through'),('reliability',2,'prepare_early'),('reliability',2,'unfinished_tasks'),
  ('warmth',3,'perspective_taking'),('warmth',3,'make_amends'),('warmth',3,'harsh_words'),
  ('social_energy',4,'group_energy'),('social_energy',4,'start_conversation'),('social_energy',4,'quiet_settings'),
  ('openness',5,'try_new_ideas'),('openness',5,'explore_views'),('openness',5,'prefer_familiar')
 ), choices as materialized (
   select d.domain_id,d.domain_order,d.code,q.ordinal,
     abs(ascii(x.option_code)-ascii(y.option_code)) as distance
   from domain_questions d join marriage.personality_questions q using(code)
   left join marriage.personality_answers x on x.member_id=a and x.question_code=q.code
   left join marriage.personality_answers y on y.member_id=b and y.question_code=q.code
 ), overall as (
   select count(distance)=15 as complete,count(distance) as covered,count(*) as total,
     round(100 - avg(distance)*25)::int as percentage,
     coalesce(jsonb_agg(code order by ordinal) filter(where distance<=1),'[]') as similarities,
     coalesce(jsonb_agg(code order by ordinal) filter(where distance>1),'[]') as differences,
     jsonb_build_object('same',count(*) filter(where distance=0),'near',count(*) filter(where distance=1),
       'different',count(*) filter(where distance=2),'far',count(*) filter(where distance=3),
       'opposite',count(*) filter(where distance=4)) as distribution
   from choices
 ), domains as (
   select domain_id,domain_order,count(distance) as covered,count(*) as total,
     round(100 - avg(distance)*25)::int as percentage
   from choices group by domain_id,domain_order
 )
 select jsonb_build_object('version','personality-v2','complete',o.complete,'covered',o.covered,'total',o.total,
   'percentage',case when o.complete then o.percentage end,'similarities',o.similarities,'differences',o.differences,
   'method','answer-distance-v1','distribution',case when o.complete then o.distribution end,
   'domains',(select jsonb_agg(jsonb_build_object('id',d.domain_id,'covered',d.covered,'total',d.total,
     'percentage',case when o.complete then d.percentage end) order by d.domain_order) from domains d))
 from overall o
 where (select count(*) from marriage.member_assessment where member_id in(a,b) and version='marriage-v4')=2
$$;
revoke all on function marriage.current_personality_fit(uuid,uuid) from public,anon,authenticated,service_role;

-- Current soft criteria use the full observed set, with at most 12 weight units per direction.
create or replace function marriage.preferred_criteria(asker uuid,peer uuid)
returns table(score float8,covered integer,total integer)
language sql stable set search_path='' as $$
 with choices as (
   select marriage.criterion_fit(asker,peer,c.criterion,c.rule) as ok
   from marriage.partner_criteria c
   where c.member_id=asker and (c.rule->>'mode'='prefer'
     or (c.rule->>'mode'='require' and marriage.pair_contract(asker,peer)='marriage-v3'))
     and not(c.criterion='children' and c.rule->>'target'='any')
 )
 select avg(ok::int)::float8,count(ok)::int,count(*)::int from choices
$$;

create function marriage.current_practical_fit(a uuid, b uuid)
 RETURNS TABLE(fit jsonb, rank_value double precision, covered integer, shared integer, provisional boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with choices as materialized (
   select d.code,d.ordinal,d.category,w.weight,
     marriage.expectation_credit(d.code,a,b,pa.option_code,sb.option_code) as ab,
     marriage.expectation_credit(d.code,b,a,pb.option_code,sa.option_code) as ba,
     case when d.code='children_plan' then 'C'
       when d.code in('marriage_timeline','parenting_approach') then 'D' end as undecided,
     pa.option_code as wanted_a,sb.option_code as self_b,
     pb.option_code as wanted_b,sa.option_code as self_a,
     case when aw.category is null then 1 else 1.35 end as priority_a,
     case when bw.category is null then 1 else 1.35 end as priority_b
   from marriage.pair_dimensions(a,b) d
   join marriage.current_topic_weights() w using(code)
   left join marriage.fit_priorities aw on aw.member_id=a and aw.category=d.category
   left join marriage.fit_priorities bw on bw.member_id=b and bw.category=d.category
   left join marriage.member_answers sa on sa.member_id=a and sa.question_code=d.code and marriage.can_answer_topic(a,d.code)
   left join marriage.member_answers sb on sb.member_id=b and sb.question_code=d.code and marriage.can_answer_topic(b,d.code)
   left join marriage.member_answers pa on pa.member_id=a and pa.question_code=d.partner_code and marriage.can_answer_topic(a,d.code)
   left join marriage.member_answers pb on pb.member_id=b and pb.question_code=d.partner_code and marriage.can_answer_topic(b,d.code)

 ), observed as (
   select *,
     ab is not null and wanted_a is distinct from undecided and self_b is distinct from undecided as known_a,
     ba is not null and wanted_b is distinct from undecided and self_a is distinct from undecided as known_b
   from choices
 ), directions as (
   select coalesce(sum(ab*weight*priority_a) filter(where known_a),0) as pa,
     coalesce(sum(weight*priority_a) filter(where known_a),0) as wa,
     coalesce(sum(ba*weight*priority_b) filter(where known_b),0) as pb,
     coalesce(sum(weight*priority_b) filter(where known_b),0) as wb,
     coalesce(sum(weight) filter(where known_a),0)+coalesce(sum(weight) filter(where known_b),0) as observed_mass,
     2*sum(weight) as applicable_mass
   from observed
 ), practical as (
   select p.age not between yp.min_age and yp.max_age or q.age not between xp.min_age and xp.max_age as age_conflict,
     marriage.city_filter_key(cp.label) not in ('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه')
     and marriage.city_filter_key(cq.label) not in ('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه') as cities_known,
     marriage.city_filter_key(cp.label)<>marriage.city_filter_key(cq.label)
     and exists(select 1 from marriage.member_answers where member_id in(a,b) and question_code='residence_plan' and option_code='A' having count(*)=2) as immobile,
     exists(select 1 from marriage.member_answers where member_id in(a,b) and question_code='children_plan' and option_code in('A','B') having count(distinct option_code)=2) as children_conflict,
     exists(select 1 from marriage.partner_criteria r where r.member_id in(a,b) and r.rule->>'mode'='require'
       and marriage.criterion_fit(r.member_id,case when r.member_id=a then b else a end,r.criterion,r.rule) is false) as required_conflict
   from marriage.profiles p join marriage.preferences xp on xp.member_id=p.member_id left join marriage.cities cp on cp.id=p.city_id
   join marriage.profiles q on q.member_id=b join marriage.preferences yp on yp.member_id=b left join marriage.cities cq on cq.id=q.city_id
   where p.member_id=a
 ), scores as (
   select sqrt(coalesce((pa+coalesce(ca.score,0)*least(ca.covered,6)*2)/nullif(wa+least(ca.covered,6)*2,0),0)
            * coalesce((pb+coalesce(cb.score,0)*least(cb.covered,6)*2)/nullif(wb+least(cb.covered,6)*2,0),0)) as ratio,
     coalesce(observed_mass::float8/nullif(applicable_mass,0),0) as coverage,
     to_jsonb(array_remove(array[case when k.age_conflict then 'age_range' end,case when k.cities_known and k.immobile then 'relocation' end,
       case when k.children_conflict then 'children_intent' end,case when k.cities_known is not true then 'location_unknown' end,
       case when k.required_conflict then 'required_criterion' end,
 case when marriage.strict_v4_conflict(a,b) or marriage.strict_v4_conflict(b,a) then 'strict_requirement' end],null)) as concerns,k.cities_known,
     ca.covered+cb.covered as criteria_covered,ca.total+cb.total as criteria_total
   from directions cross join practical k cross join marriage.preferred_criteria(a,b) ca cross join marriage.preferred_criteria(b,a) cb
 ), summary as (
   select count(*)::int as n,count(*) filter(where ab is not null and ba is not null)::int as c,
     count(distinct category) filter(where ab is not null and ba is not null) as category_count,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab=1 and ba=1),'[]') as strengths,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab is not null and ba is not null and not(ab=1 and ba=1)),'[]') as discussion,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab is null or ba is null),'[]') as missing
   from choices
 ), result as (
   select *,c<5 or category_count<3 or cities_known is not true or criteria_covered<criteria_total as tentative,
     c=n and n>0 and coalesce(cities_known,false) and criteria_covered=criteria_total and (select count(*)=2 from marriage.member_assessment where member_id in(a,b) and version='marriage-v4') as complete from summary cross join scores
 )
 select jsonb_build_object('version','marriage-v4','band',
     case when tentative then 'insufficient' when ratio>=0.75 then 'strong' when ratio>=0.45 then 'mixed' else 'explore' end,
     'practicalConcerns',concerns,'assessmentComplete',complete,'percentage',case when complete then floor(coalesce(ratio,0)*100+0.5)::int else null end,
     'criteria',jsonb_build_object('covered',criteria_covered,'total',criteria_total),
     'personality',marriage.current_personality_fit(a,b),'provisional',tentative,'covered',c,'total',n,'strengths',strengths,'discussion',discussion,'missing',missing),
   0.5+sqrt(coverage)*(ratio-0.5),c,
   (select count(*)::int from marriage.member_interests mine join marriage.member_interests peer using(interest_code)
     where mine.member_id=a and peer.member_id=b),tentative
 from result
$function$;
revoke all on function marriage.current_practical_fit(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION marriage.preference_evidence(a uuid, b uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with answers as (
  select d.code,d.ordinal,d.category,
   sa.option_code as sa,sb.option_code as sb,pa.option_code as pa,pb.option_code as pb,
   osa.code is not null and osb.code is not null and opa.code is not null and opb.code is not null
   and not(d.code='public_event_attendance' and 'D' in(sa.option_code,sb.option_code)) as complete
  from marriage.pair_dimensions(a,b) d
  left join marriage.member_answers sa on sa.member_id=a and sa.question_code=d.code and marriage.can_answer_topic(a,d.code)
  left join marriage.member_answers sb on sb.member_id=b and sb.question_code=d.code and marriage.can_answer_topic(b,d.code)
  left join marriage.member_answers pa on pa.member_id=a and pa.question_code=d.partner_code and marriage.can_answer_topic(a,d.code)
  left join marriage.member_answers pb on pb.member_id=b and pb.question_code=d.partner_code and marriage.can_answer_topic(b,d.code)
  left join marriage.question_options osa on osa.question_code=d.code and osa.code=sa.option_code
  left join marriage.question_options osb on osb.question_code=d.code and osb.code=sb.option_code
  left join marriage.question_options opa on opa.question_code=d.partner_code and opa.code=pa.option_code
  left join marriage.question_options opb on opb.question_code=d.partner_code and opb.code=pb.option_code
 ), topics as materialized (
  select code,ordinal,category,case
   when not complete then 'missing'
   when (marriage.expectation_credit(code,a,b,pa,sb)=1) and (marriage.expectation_credit(code,b,a,pb,sa)=1) then 'aligned'
   when least(marriage.expectation_credit(code,a,b,pa,sb),marriage.expectation_credit(code,b,a,pb,sa))=0.5 then 'conditional'
   when (marriage.expectation_credit(code,a,b,pa,sb)=1)<>(marriage.expectation_credit(code,b,a,pb,sa)=1) then 'one_sided'
   else 'different' end as status
  from answers
 ), categories as (
  select cat.code,cat.position,count(t.code) as total,
   count(t.code) filter(where t.status<>'missing') as covered,
   count(t.code) filter(where t.status='aligned') as aligned,
   count(t.code) filter(where t.status in('conditional','one_sided','different')) as discussion
  from marriage.fit_categories cat left join topics t on t.category=cat.code
  group by cat.code,cat.position
 ), criteria as (
  select marriage.criterion_fit(direction.asker,direction.peer,c.criterion,c.rule) as ok
  from (values(a,b),(b,a)) direction(asker,peer)
  join marriage.partner_criteria c on c.member_id=direction.asker
  where (c.rule->>'mode'='prefer' or (c.rule->>'mode'='require' and marriage.pair_contract(a,b)='marriage-v3')) and not(c.criterion='children' and c.rule->>'target'='any')
 )
 select jsonb_build_object(
  'version','preference-evidence-v1','method',case when marriage.pair_contract(a,b)='marriage-v4' then 'reciprocal-weighted-v4' else 'reciprocal-weighted-v3' end,
  'topics',coalesce((select jsonb_agg(jsonb_build_object('id',code,'status',status) order by ordinal) from topics),'[]'),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',code,'covered',covered,'total',total,
   'aligned',aligned,'discussion',discussion) order by position) from categories),'[]'),
  'criteria',(select jsonb_build_object('matched',count(*) filter(where ok is true),
   'different',count(*) filter(where ok is false),'missing',count(*) filter(where ok is null),'total',count(*)) from criteria)
 )
$function$;

create or replace function marriage.pair_fit(a uuid,b uuid)
returns table(fit jsonb,rank_value float8,covered integer,shared integer,provisional boolean)
language sql stable set search_path='' as $$
 with contract as materialized (select marriage.pair_contract(a,b)='marriage-v4' as current),
 base as (
   select v4.* from contract cross join lateral marriage.current_practical_fit(a,b) v4 where current
   union all
   select v3.* from contract cross join lateral marriage.pair_fit_before_beena(a,b) v3 where not current
 ), comparison as materialized (
   select marriage.compare_beena(marriage.beena_json(a),marriage.beena_json(b)) as value
 )
 select case when base.fit->'personality'='null'::jsonb then base.fit-'personality' else base.fit end
   || jsonb_build_object('beena',comparison.value,'preferenceEvidence',marriage.preference_evidence(a,b)),
   base.rank_value*case when base.fit->>'version'='marriage-v3' and (comparison.value->>'complete')::boolean
     then .95+(comparison.value->>'percentage')::float8/1000 else 1 end,
   base.covered,base.shared,base.provisional
 from base cross join comparison
$$;
