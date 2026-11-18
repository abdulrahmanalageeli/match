create or replace function marriage.deep_evidence(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('assessmentVersion',(select version from marriage.member_assessment where member_id=target),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('key',k,'question',q,'answer',v) order by k) from (
  select 'answer:'||a.question_code k, case when a.question_code=d->>'id' then d->>'selfPrompt' else d->>'partnerPrompt' end q,
         case when a.question_code=d->>'id' then opt->>'self' else opt->>'partner' end v
  from marriage.member_assessment m join marriage.assessment_versions ver on ver.id=m.version
  cross join lateral jsonb_array_elements(ver.catalog->'dimensions') d
  join marriage.member_answers a on a.member_id=m.member_id and a.question_code in(d->>'id',d->>'partnerId')
  cross join lateral jsonb_array_elements(d->'options') opt
  where m.member_id=target and opt->>'code'=a.option_code
  union all select 'personality:'||a.question_code,c.prompt,case a.option_code when 'A' then 'لا يشبهني إطلاقًا' when 'B' then 'يشبهني قليلًا' when 'C' then 'يشبهني أحيانًا' when 'D' then 'يشبهني غالبًا' when 'E' then 'يشبهني كثيرًا' end
  from marriage.personality_answers a join marriage.deep_personality_catalog c on c.code=a.question_code where a.member_id=target
  union all select 'requirement:'||h.dimension,q.label,'شرط أساسي في الشريك' from marriage.fit_hard_requirements h join marriage.questions q on q.code=h.dimension where h.member_id=target
  union all select 'priority:'||p.category,coalesce(c.value->>'label',p.category),'أولوية شخصية' from marriage.fit_priorities p join marriage.member_assessment a on a.member_id=p.member_id join marriage.assessment_versions v on v.id=a.version cross join lateral jsonb_array_elements(v.catalog->'categories') c where p.member_id=target and c.value->>'id'=p.category
 ) entries),'[]'::jsonb))
$$;

create or replace function marriage.deep_complete(target uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.member_assessment where member_id=target and version in ('marriage-v2','marriage-v3'))
 and (select count(*) from jsonb_array_elements(marriage.deep_evidence(target)->'entries') e where e->>'key' like 'answer:%')=32
 and (select count(*) from marriage.personality_answers where member_id=target)=12
$$;
