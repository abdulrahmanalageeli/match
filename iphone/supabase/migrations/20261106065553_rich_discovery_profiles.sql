-- Member-written public discovery details are separate from private assessments.
-- Only existing authenticated profile submission and scoped member-card RPCs use
-- this table; no direct member grants, photo links, contact values or answer codes.
create table marriage.profile_details (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 looking_for text not null default '' check(length(looking_for)<=600),
 values_statement text not null default '' check(length(values_statement)<=600),
 life_together text not null default '' check(length(life_together)<=600),
 education text not null default '' check(length(education)<=100),
 marriage_intent text not null default '' check(length(marriage_intent)<=100)
);
alter table marriage.profile_details enable row level security;
revoke all on marriage.profile_details from public,anon,authenticated,service_role;

create function marriage.profile_details_json(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'lookingFor',coalesce(d.looking_for,''),'valuesStatement',coalesce(d.values_statement,''),
  'lifeTogether',coalesce(d.life_together,''),'education',coalesce(d.education,''),'marriageIntent',coalesce(d.marriage_intent,''))
 from (select target as member_id) t left join marriage.profile_details d using(member_id)
$$;
revoke all on function marriage.profile_details_json(uuid) from public,anon,authenticated,service_role;

-- The percentage is a priority-weighted reciprocal preference index, not a
-- probability of a successful marriage. It remains null until both current
-- assessments contain every self/partner answer. Ranking remains unchanged.
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
 ), scores as (
   select sqrt(sum(ab*wa)/nullif(sum(wa) filter(where ab is not null),0)
      *sum(ba*wb)/nullif(sum(wb) filter(where ba is not null),0)) as ratio from categories
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
     'provisional',tentative,'covered',c,'total',n,'strengths',strengths,'discussion',discussion,'missing',missing),
   coalesce(ratio,0)*sqrt(c::float8/nullif(n,0)),c,
   (select count(*)::int from marriage.member_interests mine join marriage.member_interests peer using(interest_code)
     where mine.member_id=a and peer.member_id=b),tentative
 from result
$$;

create or replace function marriage.profile_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.profile_json_base(target) || marriage.profile_details_json(target) || jsonb_build_object(
  'assessmentVersion',coalesce((select version from marriage.member_assessment where member_id=target),'legacy-v0'),
  'hardRequirements',coalesce((select jsonb_agg(dimension order by dimension) from marriage.fit_hard_requirements where member_id=target),'[]'),
  'priorityCategories',coalesce((select jsonb_agg(category order by category) from marriage.fit_priorities where member_id=target),'[]'))
$$;

create or replace function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_base(viewer,subject) || marriage.profile_details_json(subject) || jsonb_build_object('fit',f.fit,
   'familyPreference',case when exists(select 1 from marriage.profile_details where member_id=subject)
     then (select family_preference from marriage.preferences where member_id=subject) else null end) from marriage.pair_fit(viewer,subject) f
$$;

create or replace function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me uuid:=marriage.require_member(); previous jsonb; normalized jsonb;
 choices jsonb; answers jsonb; hard jsonb; priorities jsonb; version text; city uuid;
 old_status text; is_suspended boolean; changed boolean; review_change boolean;
 private_keys text[]:=array['interestIds','surveyAnswers','hardRequirements','priorityCategories','assessmentVersion','preferredMinAge','preferredMaxAge'];
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
  'priorityCategories',coalesce((select jsonb_agg(v order by v) from jsonb_array_elements_text(priorities) v),'[]'));
 changed:=previous is distinct from normalized;
 review_change:=(previous - private_keys) is distinct from (normalized - private_keys);
 if changed then
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

create or replace function marriage.admin_member(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner','reviewer','moderator']); result jsonb;
begin
  if staff.role='moderator' and not exists(select 1 from marriage.reports where reported_id=target and resolved_at is null)
      and not exists(select 1 from marriage.members where id=target and suspended) then
    raise exception 'يقتصر الاطلاع على الحسابات قيد التحقيق.' using errcode='42501';
  end if;
  -- Profile submissions acquire the same member lock before updating related
  -- fields. Hold a shared lock so this review detail and its revision agree.
  perform 1 from marriage.members where id=target for share;
  result:=marriage.admin_member_summary(target);
  if result is null then raise exception 'الملف غير متاح.' using errcode='P0002'; end if;
  result:=result||jsonb_build_object(
    'bio',(select bio from marriage.profiles where member_id=target),
    'interests',coalesce((select jsonb_agg(i.label order by i.position) from marriage.member_interests mi
      join marriage.interests i on i.code=mi.interest_code where mi.member_id=target),'[]'::jsonb),
    'familyPreference',(select family_preference from marriage.preferences where member_id=target),
    'preferredMinAge',(select min_age from marriage.preferences where member_id=target),
    'preferredMaxAge',(select max_age from marriage.preferences where member_id=target),
    'consentVersion',(select version from marriage.consents where member_id=target order by id desc limit 1),
    'consentedAt',(select recorded_at from marriage.consents where member_id=target order by id desc limit 1),
    'assessmentVersion',coalesce((select version from marriage.member_assessment where member_id=target),'legacy-v0'),
    'answeredTopics',(select count(*) from marriage.member_answers where member_id=target));
  insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason)
    values(staff.user_id,staff.display_name,staff.role,'member_viewed','member',target,'Scoped profile review');
  return result || marriage.profile_details_json(target);
end $$;
