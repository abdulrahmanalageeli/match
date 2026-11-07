-- Explicitly shared marriage basics, private criteria, and a separate self-report
-- personality assessment. No event data is read or changed by this migration.
create table marriage.member_basics (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 height_cm smallint check(height_cm between 120 and 230),
 weight_kg smallint check(weight_kg between 35 and 250),
 tribal_background text check(tribal_background in('tribal','non_tribal','prefer_not_to_say')),
 tribe_name text check(length(tribe_name)<=80),
 nationality text check(length(nationality)<=80),
 marital_status text check(marital_status in('never_married','divorced','widowed')),
 children_count smallint check(children_count between 0 and 20),
 smoking text check(smoking in('never','sometimes','yes')),
 check(tribe_name is null or tribal_background='tribal')
);
create table marriage.partner_criteria (
 member_id uuid references marriage.members(id) on delete cascade,
 criterion text check(criterion in('height','weight','tribalBackground','maritalStatus','children','smoking')),
 rule jsonb not null check(jsonb_typeof(rule)='object' and rule->>'mode' in('any','prefer','require')),
 primary key(member_id,criterion)
);
create table marriage.personality_questions (
 code text primary key, ordinal smallint unique not null
);
insert into marriage.personality_questions values
 ('social_energy',1),('initiative',2),('depth',3),('openness',4),('closeness',5),('reassurance',6),
 ('support',7),('planning',8),('novelty',9),('conflict_pace',10),('directness',11),('quiet_comfort',12);
create table marriage.personality_answers (
 member_id uuid references marriage.members(id) on delete cascade,
 question_code text references marriage.personality_questions(code),
 option_code text not null check(option_code in('A','B','C','D','E')),
 primary key(member_id,question_code)
);
create index personality_answers_question on marriage.personality_answers(question_code);
alter table marriage.member_basics enable row level security;
alter table marriage.partner_criteria enable row level security;
alter table marriage.personality_questions enable row level security;
alter table marriage.personality_answers enable row level security;
revoke all on marriage.member_basics,marriage.partner_criteria,marriage.personality_questions,marriage.personality_answers from public,anon,authenticated,service_role;

create function marriage.basics_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_strip_nulls(jsonb_build_object('heightCm',height_cm,'weightKg',weight_kg,
 'tribalBackground',tribal_background,'tribeName',tribe_name,'nationality',nationality,
 'maritalStatus',marital_status,'childrenCount',children_count,'smoking',smoking)) from marriage.member_basics where member_id=target),'{}')
$$;

-- Validate before writing: unknown keys, arbitrary answer codes and malformed
-- dealbreakers are rejected rather than silently relaxing the member's choice.
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; r jsonb; lo integer; hi integer; cleaned jsonb:='{}';
begin
 if jsonb_typeof(basics) is distinct from 'object' or jsonb_typeof(criteria) is distinct from 'object'
  or jsonb_typeof(personality) is distinct from 'object' or version is distinct from 'personality-v1' then
  raise exception 'تحقق من تنسيق بيانات الزواج وتقييم الشخصية.' using errcode='22023';
 end if;
 for k,v in select key,value from jsonb_each(basics) loop
  if k not in('heightCm','weightKg','tribalBackground','tribeName','nationality','maritalStatus','childrenCount','smoking') then
   raise exception 'حقل غير معروف في بيانات الزواج.' using errcode='22023';
  end if;
  if k in('heightCm','weightKg','childrenCount') then
   lo:=case k when 'heightCm' then 120 when 'weightKg' then 35 else 0 end;
   hi:=case k when 'heightCm' then 230 when 'weightKg' then 250 else 20 end;
   if jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric not between lo and hi then
    raise exception 'تحقق من الطول والوزن وعدد الأطفال.' using errcode='22023';
   end if;
  elsif jsonb_typeof(v)<>'string' then raise exception 'تحقق من تنسيق بيانات الزواج.' using errcode='22023';
  elsif k in('tribeName','nationality') then
   if length(btrim(v#>>'{}'))>80 then raise exception 'بيانات العائلة والجنسية طويلة جدًا.' using errcode='22023'; end if;
   basics:=jsonb_set(basics,array[k],to_jsonb(btrim(v#>>'{}')));
  elsif (k='tribalBackground' and (v#>>'{}') not in('tribal','non_tribal','prefer_not_to_say'))
   or (k='maritalStatus' and (v#>>'{}') not in('never_married','divorced','widowed'))
   or (k='smoking' and (v#>>'{}') not in('never','sometimes','yes')) then
   raise exception 'خيار غير معروف في بيانات الزواج.' using errcode='22023';
  end if;
 end loop;
 if coalesce(basics->>'tribeName','')<>'' and basics->>'tribalBackground' is distinct from 'tribal' then
  raise exception 'حدد الخلفية العائلية قبل إدخال اسم القبيلة.' using errcode='22023';
 end if;
 if basics->>'tribeName'='' then basics:=basics-'tribeName'; end if;
 if basics->>'nationality'='' then basics:=basics-'nationality'; end if;
 for k,r in select key,value from jsonb_each(criteria) loop
  if k not in('height','weight','tribalBackground','maritalStatus','children','smoking') or jsonb_typeof(r)<>'object'
    or coalesce(r->>'mode','') not in('any','prefer','require') then
   raise exception 'تحقق من تنسيق شروط الشريك.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(r) f where f<>all(case when k in('height','weight') then array['mode','min','max']
    when k='maritalStatus' then array['mode','values'] else array['mode','target'] end)) then
   raise exception 'حقل غير معروف في شروط الشريك.' using errcode='22023';
  end if;
  if r->>'mode'='any' then r:='{"mode":"any"}';
  elsif k in('height','weight') then
   lo:=case when k='height' then 120 else 35 end; hi:=case when k='height' then 230 else 250 end;
   if not(r ?| array['min','max']) then raise exception 'حدد نطاقًا للتفضيل أو الشرط.' using errcode='22023'; end if;
   for v in select value from jsonb_each(r) where key in('min','max') loop
    if jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric not between lo and hi then
     raise exception 'تحقق من نطاق الطول والوزن المطلوب.' using errcode='22023';
    end if;
   end loop;
   if (r->>'min')::numeric>(r->>'max')::numeric then raise exception 'بداية النطاق أكبر من نهايته.' using errcode='22023'; end if;
  elsif k='tribalBackground' then
   if coalesce(r->>'target','') not in('tribal','non_tribal','same_tribe') or
    (r->>'target'='same_tribe' and (basics->>'tribalBackground' is distinct from 'tribal' or coalesce(basics->>'tribeName','')='')) then
    raise exception 'حدد خلفيتك العائلية لتفعيل شرط القبيلة نفسها.' using errcode='22023';
   end if;
  elsif k='maritalStatus' then
   if jsonb_typeof(r->'values') is distinct from 'array' then raise exception 'حدد الحالات الاجتماعية المقبولة.' using errcode='22023'; end if;
   if jsonb_array_length(r->'values') not between 1 and 3
    or exists(select 1 from jsonb_array_elements(r->'values') e where jsonb_typeof(e)<>'string' or (e#>>'{}') not in('never_married','divorced','widowed'))
    or exists(select 1 from jsonb_array_elements(r->'values') e group by e having count(*)>1) then
    raise exception 'حدد الحالات الاجتماعية المقبولة.' using errcode='22023';
   end if;
  elsif k='children' then
   if coalesce(r->>'target','') not in('none','any') then raise exception 'حدد تفضيل الأطفال.' using errcode='22023'; end if;
   if r->>'target'='any' then r:='{"mode":"any"}'; end if;
  elsif r->>'target' is distinct from 'never' then raise exception 'حدد تفضيل التدخين.' using errcode='22023'; end if;
  cleaned:=cleaned||jsonb_build_object(k,r);
 end loop;
 if exists(select 1 from jsonb_each(personality) e where jsonb_typeof(e.value)<>'string' or (e.value#>>'{}') not in('A','B','C','D','E')
   or e.key not in('social_energy','initiative','depth','openness','closeness','reassurance','support','planning','novelty','conflict_pace','directness','quiet_comfort')) then
  raise exception 'تحقق من إجابات تقييم الشخصية.' using errcode='22023';
 end if;
 return jsonb_build_object('marriageBasics',basics,'partnerCriteria',cleaned,'personalityAnswers',personality,'personalityVersion',version);
end $$;

create function marriage.criterion_fit(asker uuid,peer uuid,kind text,rule jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare b marriage.member_basics; own marriage.member_basics; v integer;
begin
 if rule->>'mode'='any' then return null; end if;
 if kind='children' and rule->>'target'='any' then return true; end if;
 select * into b from marriage.member_basics where member_id=peer;
 if kind in('height','weight') then
  v:=case when kind='height' then b.height_cm else b.weight_kg end;
  if v is null then return null; end if;
  return v>=coalesce((rule->>'min')::int,-2147483647) and v<=coalesce((rule->>'max')::int,2147483647);
 elsif kind='tribalBackground' then
  if b.tribal_background is null or b.tribal_background='prefer_not_to_say' then return null; end if;
  if rule->>'target'<>'same_tribe' then return b.tribal_background=rule->>'target'; end if;
  select * into own from marriage.member_basics where member_id=asker;
  if own.tribal_background is distinct from 'tribal' or own.tribe_name is null or b.tribe_name is null then return null; end if;
  return b.tribal_background='tribal' and lower(btrim(own.tribe_name))=lower(btrim(b.tribe_name));
 elsif kind='maritalStatus' then
  if b.marital_status is null then return null; end if;
  return rule->'values' ? b.marital_status;
 elsif kind='children' then return b.children_count=0;
 elsif kind='smoking' then return b.smoking='never';
 end if;
 return null;
end $$;
create function marriage.criteria_accepted(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from marriage.partner_criteria c where c.member_id in(a,b) and c.rule->>'mode'='require'
  and marriage.criterion_fit(c.member_id,case when c.member_id=a then b else a end,c.criterion,c.rule) is distinct from true)
$$;
create function marriage.preferred_criteria(asker uuid,peer uuid) returns table(score float8,covered integer,total integer)
language sql stable set search_path='' as $$
 with choices as(select marriage.criterion_fit(asker,peer,c.criterion,c.rule) as ok from marriage.partner_criteria c
  where member_id=asker and rule->>'mode'='prefer' and not(criterion='children' and rule->>'target'='any'))
 select avg(ok::int)::float8,count(ok)::int,count(*)::int from choices
$$;
create function marriage.personality_fit(a uuid,b uuid) returns jsonb language sql stable set search_path='' as $$
 with choices as(select q.code,q.ordinal,abs(ascii(x.option_code)-ascii(y.option_code)) as distance
 from marriage.personality_questions q left join marriage.personality_answers x on x.member_id=a and x.question_code=q.code
 left join marriage.personality_answers y on y.member_id=b and y.question_code=q.code)
 select jsonb_build_object('version','personality-v1','complete',count(distance)=count(*) and count(*)>0,
 'covered',count(distance),'total',count(*),'percentage',case when count(distance)=count(*) and count(*)>0 then floor(avg(1-distance::float8/4)*100+0.5)::int else null end,
 'similarities',coalesce(jsonb_agg(code order by ordinal) filter(where distance<=1),'[]'),
 'differences',coalesce(jsonb_agg(code order by ordinal) filter(where distance>1),'[]')) from choices
$$;

alter function marriage.profile_json(uuid) rename to profile_json_before_basics;
create function marriage.profile_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.profile_json_before_basics(target)||jsonb_build_object('marriageBasics',marriage.basics_json(target),
 'partnerCriteria',coalesce((select jsonb_object_agg(criterion,rule) from marriage.partner_criteria where member_id=target),'{}'),
 'personalityAnswers',coalesce((select jsonb_object_agg(question_code,option_code) from marriage.personality_answers where member_id=target),'{}'),
 'personalityVersion','personality-v1')
$$;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_basics;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_before_basics(viewer,subject)||jsonb_build_object('marriageBasics',marriage.basics_json(subject))
$$;
alter function marriage.admin_member(uuid) rename to admin_member_before_basics;
create function marriage.admin_member(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=marriage.admin_member_before_basics(target);
 return result||jsonb_build_object('marriageBasics',marriage.basics_json(target));
end $$;
alter function marriage.compatible(uuid,uuid) rename to compatible_before_basics;
create function marriage.compatible(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.compatible_before_basics(a,b) and (
  exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(a,b)
   and greatest(r.requester_id,r.recipient_id)=greatest(a,b) and r.status='accepted')
  or exists(select 1 from marriage.introductions i join marriage.introduction_decisions da on da.introduction_id=i.id and da.member_id=a
   join marriage.introduction_decisions db on db.introduction_id=i.id and db.member_id=b where i.member_a=least(a,b) and i.member_b=greatest(a,b) and i.closed_at is null)
  or marriage.criteria_accepted(a,b))
$$;
revoke all on function marriage.basics_json(uuid),marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text),
 marriage.criterion_fit(uuid,uuid,text,jsonb),marriage.criteria_accepted(uuid,uuid),marriage.preferred_criteria(uuid,uuid),
 marriage.personality_fit(uuid,uuid),marriage.profile_json(uuid),marriage.member_card(uuid,uuid),marriage.admin_member(uuid),marriage.compatible(uuid,uuid)
 from public,anon,authenticated,service_role;
-- The public staff RPC is an invoker; only this checked entrypoint is callable.
grant execute on function marriage.admin_member(uuid) to authenticated;
revoke all on function marriage.admin_member_before_basics(uuid) from public,anon,authenticated,service_role;

create or replace function marriage.pair_fit(a uuid,b uuid)
returns table(fit jsonb,rank_value double precision,covered integer,shared integer,provisional boolean)
language sql stable set search_path='' as $$
 with choices as materialized (
   select d.code,d.ordinal,d.category,pa.option_code=sb.option_code as ab,pb.option_code=sa.option_code as ba
   from marriage.fit_dimensions d
   left join marriage.member_answers sa on sa.member_id=a and sa.question_code=d.code
   left join marriage.member_answers sb on sb.member_id=b and sb.question_code=d.code
   left join marriage.member_answers pa on pa.member_id=a and pa.question_code=d.partner_code
   left join marriage.member_answers pb on pb.member_id=b and pb.question_code=d.partner_code
 ), categories as (
   select cat.code,cat.weight*case when aw.category is null then 1 else 2 end as wa,
     cat.weight*case when bw.category is null then 1 else 2 end as wb,
     avg((c.ab::integer)::float8) as ab,avg((c.ba::integer)::float8) as ba
   from marriage.fit_categories cat join choices c on c.category=cat.code
   left join marriage.fit_priorities aw on aw.member_id=a and aw.category=cat.code
   left join marriage.fit_priorities bw on bw.member_id=b and bw.category=cat.code
   group by cat.code,cat.weight,aw.category,bw.category
 ), score_inputs as (
   select sum(ab*wa)/nullif(sum(wa) filter(where ab is not null),0) as forward,
     sum(ba*wb)/nullif(sum(wb) filter(where ba is not null),0) as reverse from categories
 ), scores as (
   select sqrt((case when ca.score is null then s.forward else s.forward*0.8+ca.score*0.2 end)
     *(case when cb.score is null then s.reverse else s.reverse*0.8+cb.score*0.2 end)) as ratio,
     ca.covered+cb.covered as criteria_covered,ca.total+cb.total as criteria_total
   from score_inputs s cross join marriage.preferred_criteria(a,b) ca cross join marriage.preferred_criteria(b,a) cb
 ), summary as (
   select count(*)::int as n,count(*) filter(where ab is not null and ba is not null)::int as c,
     count(distinct category) filter(where ab is not null and ba is not null) as category_count,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab and ba),'[]') as strengths,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab is not null and ba is not null and not(ab and ba)),'[]') as discussion,
     coalesce(jsonb_agg(code order by ordinal) filter(where ab is null or ba is null),'[]') as missing
   from choices
 ), result as (
   select *,c<5 or category_count<3 as tentative,
     c=n and n>0 and (select count(*)=2 from marriage.member_assessment where member_id in(a,b) and version='marriage-v1') as complete from summary cross join scores
 )
 select jsonb_build_object('version','marriage-v1','band',
     case when tentative then 'insufficient' when ratio>=0.75 then 'strong' when ratio>=0.45 then 'mixed' else 'explore' end,
     'assessmentComplete',complete,'percentage',case when complete then floor(coalesce(ratio,0)*100+0.5)::int else null end,
     'criteria',jsonb_build_object('covered',criteria_covered,'total',criteria_total),
     'personality',marriage.personality_fit(a,b),'provisional',tentative,'covered',c,'total',n,'strengths',strengths,'discussion',discussion,'missing',missing),
   coalesce(ratio,0)*sqrt(c::float8/nullif(n,0)),c,
   (select count(*)::int from marriage.member_interests mine join marriage.member_interests peer using(interest_code)
     where mine.member_id=a and peer.member_id=b),tentative
 from result
$$;


create or replace function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me uuid:=marriage.require_member(); previous jsonb; normalized jsonb; extras jsonb; basics jsonb;
 choices jsonb; answers jsonb; hard jsonb; priorities jsonb; version text; city uuid;
 old_status text; is_suspended boolean; changed boolean; review_change boolean;
 private_keys text[]:=array['interestIds','surveyAnswers','hardRequirements','priorityCategories','assessmentVersion','preferredMinAge','preferredMaxAge','partnerCriteria','personalityAnswers','personalityVersion'];
begin
 select review_status,suspended into strict old_status,is_suspended from marriage.members where id=me for update;
 if is_suspended then raise exception 'الحساب قيد مراجعة البلاغات.' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or payload->>'consentVersion' is distinct from
   (case when payload->>'assessmentVersion'='marriage-v1' then '2026-11-06-assessment' else '2026-11-05' end) then
   raise exception 'يلزم الاطّلاع على سياسة الخصوصية الحالية والموافقة عليها.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_each(payload) v where v.key=any(array['lookingFor','valuesStatement','lifeTogether','education','marriageIntent'])
   and (jsonb_typeof(v.value)<>'string' or length(btrim(v.value#>>'{}'))>case when v.key in('education','marriageIntent') then 100 else 600 end)) then
   raise exception 'تحقق من طول تفاصيل ملفك العام وتنسيقها.' using errcode='22023';
 end if;
 previous:=marriage.profile_json(me);
 extras:=marriage.normalize_marriage_extras(coalesce(payload->'marriageBasics',previous->'marriageBasics','{}'),
  coalesce(payload->'partnerCriteria',previous->'partnerCriteria','{}'),
  coalesce(payload->'personalityAnswers',previous->'personalityAnswers','{}'),
  coalesce(payload->>'personalityVersion',previous->>'personalityVersion','personality-v1'));
 basics:=extras->'marriageBasics';
 choices:=coalesce(payload->'interestIds',previous->'interestIds','[]');
 answers:=coalesce(payload->'surveyAnswers',previous->'surveyAnswers','{}');
 hard:=coalesce(payload->'hardRequirements',previous->'hardRequirements','[]');
 priorities:=coalesce(payload->'priorityCategories',previous->'priorityCategories','[]');
 version:=coalesce(payload->>'assessmentVersion',previous->>'assessmentVersion','legacy-v0');
 if version not in('legacy-v0','marriage-v1') or jsonb_typeof(choices)<>'array' or jsonb_typeof(answers)<>'object'
   or jsonb_typeof(hard)<>'array' or jsonb_typeof(priorities)<>'array' then
   raise exception 'تحقق من نسخة التقييم وتنسيق الإجابات.' using errcode='22023';
 end if;
 -- Clients predating the assessment know only the original two pairs. Preserve
 -- newer answers, settings and the newer version when such a client edits the profile.
 if payload->>'assessmentVersion' is null or payload->>'assessmentVersion'='legacy-v0' then
   if payload ? 'surveyAnswers' then
     if exists(select 1 from jsonb_object_keys(payload->'surveyAnswers') k where k not in(
       'conversation_initiative_preference','partner_conversation_initiative_preference','match_disagreement_style','partner_match_disagreement_style')) then
       raise exception 'حدّث التطبيق لتعديل نسخة التقييم.' using errcode='22023';
     end if;
     answers:=(coalesce(previous->'surveyAnswers','{}') - array['conversation_initiative_preference','partner_conversation_initiative_preference',
       'match_disagreement_style','partner_match_disagreement_style']) || answers;
   end if;
   version:=coalesce(previous->>'assessmentVersion','legacy-v0');
   hard:=coalesce(previous->'hardRequirements','[]');
   priorities:=coalesce(previous->'priorityCategories','[]');
 end if;
 if jsonb_array_length(choices)>3 or jsonb_array_length(priorities)>2
   or exists(select 1 from jsonb_array_elements(choices) c group by c having count(*)>1)
   or exists(select 1 from jsonb_array_elements(hard) c group by c having count(*)>1)
   or exists(select 1 from jsonb_array_elements(priorities) c group by c having count(*)>1)
   or exists(select 1 from jsonb_array_elements_text(choices) c(id) where not exists(select 1 from marriage.interests i where i.code=c.id))
   or exists(select 1 from jsonb_each(answers) v where jsonb_typeof(v.value)<>'string' or not exists(
     select 1 from marriage.question_options o where o.question_code=v.key and o.code=answers->>v.key))
   or exists(select 1 from jsonb_array_elements_text(priorities) c(id) where not exists(select 1 from marriage.fit_categories cat where cat.code=c.id))
   or exists(select 1 from jsonb_array_elements_text(hard) c(id) where not exists(
     select 1 from marriage.fit_dimensions d where d.code=c.id and d.hard_allowed and answers ? d.partner_code)) then
   raise exception 'تحقق من الاهتمامات والإجابات والأولويات وحدد تفضيلك قبل جعل الشرط أساسيًا.' using errcode='22023';
 end if;
 normalized:=jsonb_build_object('displayName',btrim(payload->>'displayName'),'age',(payload->>'age')::smallint,
  'gender',payload->>'gender','city',btrim(payload->>'city'),'profession',btrim(payload->>'profession'),
  'bio',btrim(payload->>'bio'),'contact',btrim(payload->>'contact'),'preferredMinAge',coalesce((payload->>'preferredMinAge')::smallint,18),
  'preferredMaxAge',coalesce((payload->>'preferredMaxAge')::smallint,110),'familyPreference',btrim(coalesce(payload->>'familyPreference','')),
  'lookingFor',btrim(coalesce(payload->>'lookingFor',previous->>'lookingFor','')),
  'valuesStatement',btrim(coalesce(payload->>'valuesStatement',previous->>'valuesStatement','')),
  'lifeTogether',btrim(coalesce(payload->>'lifeTogether',previous->>'lifeTogether','')),
  'education',btrim(coalesce(payload->>'education',previous->>'education','')),
  'marriageIntent',btrim(coalesce(payload->>'marriageIntent',previous->>'marriageIntent','')),
  'interestIds',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(choices) v),'[]'::jsonb),'surveyAnswers',answers,
  'assessmentVersion',version,'hardRequirements',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(hard) v),'[]'),
  'priorityCategories',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(priorities) v),'[]'))||extras;
 changed:=previous is distinct from normalized;
 review_change:=(previous - private_keys) is distinct from (normalized - private_keys);
 if changed then
  if payload ? 'marriageBasics' or exists(select 1 from marriage.member_basics where member_id=me) then
   insert into marriage.member_basics(member_id,height_cm,weight_kg,tribal_background,tribe_name,nationality,marital_status,children_count,smoking)
    values(me,(basics->>'heightCm')::smallint,(basics->>'weightKg')::smallint,basics->>'tribalBackground',basics->>'tribeName',
     basics->>'nationality',basics->>'maritalStatus',(basics->>'childrenCount')::smallint,basics->>'smoking')
    on conflict(member_id) do update set height_cm=excluded.height_cm,weight_kg=excluded.weight_kg,
     tribal_background=excluded.tribal_background,tribe_name=excluded.tribe_name,nationality=excluded.nationality,
     marital_status=excluded.marital_status,children_count=excluded.children_count,smoking=excluded.smoking;
  end if;
  delete from marriage.partner_criteria where member_id=me;
  insert into marriage.partner_criteria select me,key,value from jsonb_each(extras->'partnerCriteria');
  delete from marriage.personality_answers where member_id=me;
  insert into marriage.personality_answers select me,key,value from jsonb_each_text(extras->'personalityAnswers');
  insert into marriage.cities(label) values (normalized->>'city') on conflict(label) do nothing;
  select c.id into strict city from marriage.cities c where label=normalized->>'city';
  insert into marriage.profiles(member_id,display_name,age,gender,city_id,profession,bio)
   values(me,normalized->>'displayName',(normalized->>'age')::smallint,normalized->>'gender',city,normalized->>'profession',normalized->>'bio')
   on conflict(member_id) do update set display_name=excluded.display_name,age=excluded.age,gender=excluded.gender,city_id=excluded.city_id,
    profession=excluded.profession,bio=excluded.bio;
  -- Omitted fields from older clients preserve prior public text; they never
  -- publish an older profile's family preference without an explicit new field.
  if payload ?| array['lookingFor','valuesStatement','lifeTogether','education','marriageIntent']
    or exists(select 1 from marriage.profile_details where member_id=me) then
   insert into marriage.profile_details(member_id,looking_for,values_statement,life_together,education,marriage_intent) values(me,normalized->>'lookingFor',normalized->>'valuesStatement',normalized->>'lifeTogether',normalized->>'education',normalized->>'marriageIntent')
    on conflict(member_id) do update set looking_for=excluded.looking_for,values_statement=excluded.values_statement,life_together=excluded.life_together,education=excluded.education,marriage_intent=excluded.marriage_intent;
  end if;
  insert into marriage.preferences values(me,(normalized->>'preferredMinAge')::smallint,(normalized->>'preferredMaxAge')::smallint,normalized->>'familyPreference')
   on conflict(member_id) do update set min_age=excluded.min_age,max_age=excluded.max_age,family_preference=excluded.family_preference;
  insert into marriage.contacts values(me,normalized->>'contact') on conflict(member_id) do update set contact_value=excluded.contact_value;
  delete from marriage.member_interests where member_id=me;
  insert into marriage.member_interests select me,v from jsonb_array_elements_text(choices) v;
  delete from marriage.member_answers where member_id=me;
  insert into marriage.member_answers select me,key,value from jsonb_each_text(answers);
  insert into marriage.member_assessment values(me,version) on conflict(member_id) do update set version=excluded.version;
  delete from marriage.fit_priorities where member_id=me;
  insert into marriage.fit_priorities select me,v from jsonb_array_elements_text(priorities) v;
  delete from marriage.fit_hard_requirements where member_id=me;
  insert into marriage.fit_hard_requirements select me,v from jsonb_array_elements_text(hard) v;
  update marriage.introductions i set closed_at=now() where closed_at is null and me in(member_a,member_b) and
    (review_change or not marriage.compatible(me,case when member_a=me then member_b else member_a end));
  if not review_change then
    update marriage.member_requests r set status='closed',updated_at=now()
    where r.status='pending' and me in(r.requester_id,r.recipient_id)
    and not marriage.compatible(me,case when r.requester_id=me then r.recipient_id else r.requester_id end);
  end if;
 end if;
 if review_change or old_status<>'approved' then
   update marriage.members set review_status='pending' where id=me;
   insert into marriage.reviews(member_id,action) values(me,'submit');
 end if;
 insert into marriage.consents(member_id,version) values(me,payload->>'consentVersion');
 return marriage.member_state(me);
end $$;

