-- Derived, privacy-safe explanations for the existing compatibility score.
-- No individual answers, preferred values, or directional identities leave this helper.
create or replace function marriage.preference_evidence(a uuid,b uuid) returns jsonb
language sql stable set search_path='' as $evidence$
 with answers as (
  select d.code,d.ordinal,d.category,
   sa.option_code as sa,sb.option_code as sb,pa.option_code as pa,pb.option_code as pb,
   osa.code is not null and osb.code is not null and opa.code is not null and opb.code is not null as complete
  from marriage.fit_dimensions d
  left join marriage.member_answers sa on sa.member_id=a and sa.question_code=d.code
  left join marriage.member_answers sb on sb.member_id=b and sb.question_code=d.code
  left join marriage.member_answers pa on pa.member_id=a and pa.question_code=d.partner_code
  left join marriage.member_answers pb on pb.member_id=b and pb.question_code=d.partner_code
  left join marriage.question_options osa on osa.question_code=d.code and osa.code=sa.option_code
  left join marriage.question_options osb on osb.question_code=d.code and osb.code=sb.option_code
  left join marriage.question_options opa on opa.question_code=d.partner_code and opa.code=pa.option_code
  left join marriage.question_options opb on opb.question_code=d.partner_code and opb.code=pb.option_code
 ), topics as materialized (
  select code,ordinal,category,case
   when not complete then 'missing'
   when pa=sb and pb=sa then 'aligned'
   when (pa=sb)<>(pb=sa) then 'one_sided'
   else 'different' end as status
  from answers
 ), categories as (
  select cat.code,cat.position,count(t.code) as total,
   count(t.code) filter(where t.status<>'missing') as covered,
   count(t.code) filter(where t.status='aligned') as aligned,
   count(t.code) filter(where t.status in('one_sided','different')) as discussion
  from marriage.fit_categories cat left join topics t on t.category=cat.code
  group by cat.code,cat.position
 ), criteria as (
  select marriage.criterion_fit(direction.asker,direction.peer,c.criterion,c.rule) as ok
  from (values(a,b),(b,a)) direction(asker,peer)
  join marriage.partner_criteria c on c.member_id=direction.asker
  where c.rule->>'mode'='prefer' and not(c.criterion='children' and c.rule->>'target'='any')
 )
 select jsonb_build_object(
  'version','preference-evidence-v1','method','reciprocal-weighted-v1',
  'topics',coalesce((select jsonb_agg(jsonb_build_object('id',code,'status',status) order by ordinal) from topics),'[]'),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',code,'covered',covered,'total',total,
   'aligned',aligned,'discussion',discussion) order by position) from categories),'[]'),
  'criteria',(select jsonb_build_object('matched',count(*) filter(where ok is true),
   'different',count(*) filter(where ok is false),'missing',count(*) filter(where ok is null),'total',count(*)) from criteria)
 )
$evidence$;
revoke all on function marriage.preference_evidence(uuid,uuid) from public,anon,authenticated,service_role;

-- Preserve the score, existing personality/Beena payloads, rank, coverage and ACLs.
do $patch$
declare
 definition text:=pg_get_functiondef('marriage.pair_fit(uuid,uuid)'::regprocedure);
 anchor text:=$old$base.fit||jsonb_build_object('beena',comparison.value)$old$;
 replacement text:=$new$base.fit||jsonb_build_object('beena',comparison.value,'preferenceEvidence',marriage.preference_evidence($1,$2))$new$;
begin
 if strpos(definition,anchor)=0 then raise exception 'Preference evidence stopped: pair_fit wrapper changed.';end if;
 execute replace(definition,anchor,replacement);
end $patch$;
