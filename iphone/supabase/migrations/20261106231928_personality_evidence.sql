-- Nisfayn only. Explain the existing equal-weight similarity calculation without
-- changing scores, ranking, saved answers, or exposing either member's choices.
create or replace function marriage.personality_fit(a uuid,b uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with domain_questions(domain_id,domain_order,code) as(values
  ('communication',1,'initiative'),('communication',1,'depth'),('communication',1,'directness'),
  ('closeness',2,'openness'),('closeness',2,'closeness'),('closeness',2,'reassurance'),
  ('everyday',3,'social_energy'),('everyday',3,'planning'),('everyday',3,'novelty'),
  ('pressure',4,'support'),('pressure',4,'conflict_pace'),('pressure',4,'quiet_comfort')),
 choices as(select q.code,q.ordinal,abs(ascii(x.option_code)-ascii(y.option_code)) as distance
  from marriage.personality_questions q
  left join marriage.personality_answers x on x.member_id=a and x.question_code=q.code
  left join marriage.personality_answers y on y.member_id=b and y.question_code=q.code),
 overall as(select count(distance)=count(*) and count(*)>0 as complete,
  count(distance) as covered,count(*) as total,
  floor(avg(1-distance::float8/4)*100+0.5)::int as percentage,
  coalesce(jsonb_agg(code order by ordinal) filter(where distance<=1),'[]') as similarities,
  coalesce(jsonb_agg(code order by ordinal) filter(where distance>1),'[]') as differences,
  jsonb_build_object('same',count(*) filter(where distance=0),'near',count(*) filter(where distance=1),
   'different',count(*) filter(where distance=2),'far',count(*) filter(where distance=3),
   'opposite',count(*) filter(where distance=4)) as distribution from choices),
 domains as(select d.domain_id,d.domain_order,count(c.distance) as covered,count(*) as total,
   floor(avg(1-c.distance::float8/4)*100+0.5)::int as percentage
  from domain_questions d left join choices c on c.code=d.code group by d.domain_id,d.domain_order)
 select jsonb_build_object('version','personality-v1','complete',o.complete,'covered',o.covered,'total',o.total,
  'percentage',case when o.complete then o.percentage end,'similarities',o.similarities,'differences',o.differences,
  'method','answer-distance-v1','distribution',case when o.complete then o.distribution end,
  'domains',(select jsonb_agg(jsonb_build_object('id',d.domain_id,'covered',d.covered,'total',d.total,
    'percentage',case when o.complete then d.percentage end) order by d.domain_order) from domains d)) from overall o
$$;
-- This remains an internal invoker helper behind the existing authorized APIs.
revoke all on function marriage.personality_fit(uuid,uuid) from public,anon,authenticated,service_role;
