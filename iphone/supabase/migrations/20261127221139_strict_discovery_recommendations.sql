-- Recommendation distance is private: zero for a strict match, one for a close
-- match, null when this pair must not be recommended in either direction.
create function marriage.recommendation_distance(a uuid, b uuid) returns integer
language sql stable set search_path='' as $$
 with pair as (
   select greatest(0, xp.min_age-q.age, q.age-xp.max_age) as first_gap,
          greatest(0, yp.min_age-p.age, p.age-yp.max_age) as second_gap
   from marriage.profiles p join marriage.preferences xp on xp.member_id=p.member_id
   join marriage.profiles q on q.member_id=b join marriage.preferences yp on yp.member_id=q.member_id
   join marriage.cities pc on pc.id=p.city_id join marriage.cities qc on qc.id=q.city_id
   where p.member_id=a and p.gender<>q.gender and p.age between 18 and 110 and q.age between 18 and 110
     and ((marriage.city_filter_key(pc.label)=marriage.city_filter_key(qc.label)
       and marriage.city_filter_key(pc.label) not in ('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه'))
       or marriage.common_city_possible(a,b))
     and marriage.polygyny_accepted(a,b) and marriage.criteria_accepted(a,b)
 ), hard as (
   select h.member_id, case when h.member_id=a then b else a end as peer, d.code, d.partner_code, d.hard_allowed,
          coalesce(v.version='marriage-v4',false) as current_assessment
   from marriage.fit_hard_requirements h join marriage.fit_dimensions d on d.code=h.dimension
   left join marriage.member_assessment v on v.member_id=h.member_id
   where h.member_id in (a,b)
 ), soft as (
   select count(*)::integer as misses from marriage.partner_criteria c
   where c.member_id in(a,b) and c.rule->>'mode'='prefer'
     and not (c.criterion='children' and c.rule->>'target'='any')
     and marriage.criterion_fit(c.member_id,case when c.member_id=a then b else a end,c.criterion,c.rule) is not true
 )
 select cost from pair cross join soft
 cross join lateral (select (first_gap>0)::integer + (second_gap>0)::integer + misses as cost) distance
 where greatest(first_gap,second_gap)<=2 and cost<=1 and not exists (
   select 1 from hard h
   left join marriage.member_answers want on want.member_id=h.member_id and want.question_code=h.partner_code
   left join marriage.member_answers observed on observed.member_id=h.peer and observed.question_code=h.code
   where not (h.current_assessment and (h.code='residence_plan' or
      (h.code='parenting_approach' and not exists(select 1 from marriage.pair_dimensions(a,b) d where d.code=h.code))))
     and (not h.hard_allowed or not marriage.can_answer_topic(h.member_id,h.code) or not marriage.can_answer_topic(h.peer,h.code)
       or (h.current_assessment and not exists(select 1 from marriage.pair_dimensions(a,b) d where d.code=h.code))
       or marriage.preference_answer_fit(h.code,h.member_id,h.peer,want.option_code,observed.option_code) is not true)
 )
$$;
revoke all on function marriage.recommendation_distance(uuid,uuid) from public,anon,authenticated,service_role;

-- Weekly history still fixes each free member's score allowance. New batches
-- select strict candidates first, with close candidates eligible only for slots 1–3.
create or replace function marriage.ranked_week(target uuid,w date)
returns table(candidate_id uuid,slot smallint) language sql stable set search_path='' as $$
 with eligible as materialized (
   select p.member_id, marriage.recommendation_distance(target,p.member_id) as distance
   from marriage.profiles p where marriage.relationship_member_allowed(target) and marriage.relationship_member_allowed(p.member_id)
     and marriage.compatible(target,p.member_id)
     and not exists(select 1 from marriage.discovery_choices dc where dc.member_id=target and dc.subject_id=p.member_id and dc.hidden)
     and not exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(target,p.member_id)
       and greatest(r.requester_id,r.recipient_id)=greatest(target,p.member_id) and marriage.request_suppresses_discovery(r))
     and not exists(select 1 from marriage.introductions i where i.member_a=least(target,p.member_id) and i.member_b=greatest(target,p.member_id))
 ), ranked as (
   select e.member_id,e.distance,row_number() over (order by e.distance,score.provisional,score.rank_value desc,
       score.covered desc,score.shared desc,seen.last_week nulls first,e.member_id) as pos
   from eligible e cross join lateral marriage.pair_fit(target,e.member_id) score
   left join lateral (select max(h.week_start) last_week from marriage.weekly_candidates h
     where h.member_id=target and h.candidate_id=e.member_id and h.week_start<w) seen on true
   where e.distance is not null
 )
 select member_id,pos::smallint from ranked where pos<=5 and (distance=0 or pos<=3) order by pos
$$;

CREATE OR REPLACE FUNCTION marriage.browse(options jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=marriage.require_discovery_member(); skip integer:=coalesce((options->>'offset')::integer,0); filter_key text; filter_value jsonb; minimum integer; maximum integer;
  recommending boolean := coalesce(options->>'mode'='recommended',false);
  allow_close boolean := coalesce(options->'includeCloseRecommendations'='true'::jsonb,false);
  prefer_week boolean := coalesce(options->>'sort','')='' and coalesce(options->'luna','[]'::jsonb)='[]'::jsonb;
  include_ineligible boolean := coalesce(options->>'mode'='all' and options->'includeIneligible'='true'::jsonb
    and options->'eligibleOnly' is distinct from 'true'::jsonb and not (options ? 'luna'), false);
  begin
 if options ? 'luna' and (not marriage.is_serious(me) or exists(select 1 from marriage.luna_search_usage where member_id=me and blocked)) then raise exception 'البحث مع لونا متاح لوسام الجدية.' using errcode='42501';end if; if not marriage.is_paid(me) then options:=options-'minFit';end if;
 foreach filter_key in array array['education','profession'] loop
  if coalesce(options->>filter_key,'')<>'' and not((options->>filter_key)=any(marriage.structured_profile_choices(filter_key))) then
   raise exception 'اختر الدراسة والعمل من خيارات التصفية.' using errcode='22023';
  end if;
 end loop;
 if coalesce(options->>'children','') not in('','none','has') then raise exception 'اختر تفضيل وجود الأبناء.' using errcode='22023';end if;
 foreach filter_key in array array['minHeight','maxHeight','minWeight','maxWeight'] loop
  filter_value:=options->filter_key;
  if filter_value is null or filter_value='null'::jsonb then continue;end if;
  minimum:=case when filter_key in('minHeight','maxHeight') then 120 else 35 end;
  maximum:=case when filter_key in('minHeight','maxHeight') then 230 else 250 end;
  if jsonb_typeof(filter_value)<>'number' then raise exception 'اختر نطاق الطول والوزن.' using errcode='22023';end if;
  if (filter_value#>>'{}')::numeric<>trunc((filter_value#>>'{}')::numeric)
   or (filter_value#>>'{}')::numeric not between minimum and maximum then
   raise exception 'اختر نطاق الطول والوزن.' using errcode='22023';
  end if;
 end loop;
 if (options->>'minHeight')::integer>(options->>'maxHeight')::integer
  or (options->>'minWeight')::integer>(options->>'maxWeight')::integer then
  raise exception 'بداية النطاق أكبر من نهايته.' using errcode='22023';
 end if;
 perform marriage.consume_safety_budget(me,'browse','1 minute',30);
 perform marriage.consume_safety_budget(me,'browse_day','1 day',250); if skip<0 or skip>100000 or coalesce((options->>'minAge')::int,18)<18 or coalesce((options->>'maxAge')::int,110)>110 then raise exception 'تحقق من خيارات التصفية.'; end if;
 if exists(select 1 from marriage.exclusive_members where member_id=me) then return '[]'; end if;
 perform marriage.expire_my_requests(); if options->>'mode'='recommended' then perform marriage.ensure_week(me,marriage.current_week());end if; return (with eligible as materialized (
  select p.member_id,p.age, case when recommending then marriage.recommendation_distance(me,p.member_id) end as distance, eligibility.can_request, case when options ? 'luna' then marriage.luna_score(marriage.member_card(me,p.member_id),options->'luna') else 0 end as luna_rank, f.rank_value from marriage.profiles p
  join marriage.cities c on c.id=p.city_id left join marriage.member_basics b on b.member_id=p.member_id
  left join marriage.profile_details details on details.member_id=p.member_id
  cross join lateral marriage.pair_fit(me,p.member_id) f
  cross join lateral (select marriage.compatible(me,p.member_id)
     and (not exists(select 1 from marriage.member_requests established where established.status='accepted'
       and least(established.requester_id,established.recipient_id)=least(me,p.member_id)
       and greatest(established.requester_id,established.recipient_id)=greatest(me,p.member_id))
       or marriage.new_pair_requirements(me,p.member_id)) as can_request) eligibility
  where p.member_id<>me and (recommending or options->>'subjectId' is null or p.member_id=(options->>'subjectId')::uuid)
 and (options#>>'{lunaFields,minAge}' is null or p.age >= (options#>>'{lunaFields,minAge}')::int)
 and (options#>>'{lunaFields,maxAge}' is null or p.age <= (options#>>'{lunaFields,maxAge}')::int)
 and (options#>>'{lunaFields,city}' is null or marriage.city_filter_key(c.label)=marriage.city_filter_key(options#>>'{lunaFields,city}'))
 and (options#>>'{lunaFields,smoking}' is null or b.smoking=options#>>'{lunaFields,smoking}')
 and (options#>>'{lunaFields,maritalStatus}' is null or b.marital_status=options#>>'{lunaFields,maritalStatus}')
 and (jsonb_array_length(coalesce(options->'excludeCities','[]'))=0 or marriage.city_filter_key(c.label) not in('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه'))
 and (jsonb_array_length(coalesce(options->'excludeNationalities','[]'))=0 or nullif(trim(b.nationality),'') is not null and b.nationality<>'prefer_not_to_say')
 and (jsonb_array_length(coalesce(options->'excludeTribalBackgrounds','[]'))=0 or marriage.sensitive_publication_allowed(p.member_id) and b.tribal_background in('tribal','non_tribal'))
 and (jsonb_array_length(coalesce(options->'excludeSmoking','[]'))=0 or b.smoking is not null and (b.smoking not in('sometimes','yes') or not((options->'excludeSmoking') ?| array['cigarettes','vape','shisha'])))
 and (jsonb_array_length(coalesce(options->'excludeMaritalStatuses','[]'))=0 or b.marital_status is not null)
 and (not recommending or not exists(select 1 from marriage.member_requests active where me in(active.requester_id,active.recipient_id)
   and p.member_id in(active.requester_id,active.recipient_id) and active.status in('pending','accepted')))
 and not exists(select 1 from marriage.discovery_choices dc where dc.member_id=me and dc.subject_id=p.member_id and dc.hidden)
 and (coalesce(options->>'nationality','')='' or marriage.normalize_nationality(b.nationality)=marriage.normalize_nationality(options->>'nationality'))
 and (coalesce(options->>'tribalBackground','')='' or (case when marriage.sensitive_publication_allowed(p.member_id) then b.tribal_background end)=options->>'tribalBackground')
 and not exists(select 1 from jsonb_array_elements_text(coalesce(options->'excludeCities','[]'::jsonb)) excluded_city(value) where marriage.city_filter_key(excluded_city.value)=marriage.city_filter_key(c.label))
 and not exists(select 1 from jsonb_array_elements_text(coalesce(options->'excludeNationalities','[]'::jsonb)) excluded(value) where marriage.normalize_nationality(excluded.value)=marriage.normalize_nationality(b.nationality))
 and not coalesce(options->'excludeTribalBackgrounds','[]'::jsonb)?coalesce((case when marriage.sensitive_publication_allowed(p.member_id) then b.tribal_background end),'')
 and not coalesce(options->'excludeSmoking','[]'::jsonb)?coalesce(b.smoking,'')
 and not coalesce(options->'excludeMaritalStatuses','[]'::jsonb)?coalesce(b.marital_status,'')
 and (coalesce((options->>'onlineOnly')::boolean,false)=false or exists(select 1 from marriage.member_presence mp where mp.member_id=p.member_id and mp.last_seen>now()-interval '90 seconds'))
 and marriage.relationship_member_allowed(p.member_id)
   and (eligibility.can_request or (include_ineligible
     and exists(select 1 from marriage.members directory_member where directory_member.id=p.member_id
       and directory_member.review_status='approved'
       and not (directory_member.paused or directory_member.suspended or directory_member.is_dummy))
     and p.gender<>(select own.gender from marriage.profiles own where own.member_id=me)
     and not marriage.permanent_boundary(me,p.member_id)))
   and not exists(select 1 from marriage.exclusive_members where member_id=p.member_id)
   and p.age between coalesce((options->>'minAge')::int,18) and coalesce((options->>'maxAge')::int,110)
   and (coalesce(options->>'city','')='' or marriage.city_filter_key(c.label)=marriage.city_filter_key(left(options->>'city',80)))
   and (coalesce(options->>'education','')='' or marriage.structured_profile_value('education',details.education)=options->>'education')
   and (coalesce(options->>'profession','')='' or marriage.structured_profile_value('profession',p.profession)=options->>'profession')
   and (options->>'minHeight' is null or b.height_cm>=(options->>'minHeight')::integer)
   and (options->>'maxHeight' is null or b.height_cm<=(options->>'maxHeight')::integer)
   and (options->>'minWeight' is null or b.weight_kg>=(options->>'minWeight')::integer)
   and (options->>'maxWeight' is null or b.weight_kg<=(options->>'maxWeight')::integer)
   and (coalesce(options->>'children','')='' or (options->>'children'='none' and b.children_count=0) or (options->>'children'='has' and b.children_count>0))
   and (coalesce(options->>'language','')='' or (b.language_details->'spokenLanguages') ? (options->>'language'))
 and (coalesce(options->>'search','')='' or strpos(lower(concat_ws(' ',p.display_name,p.profession,p.bio)),lower(left(options->>'search',80)))>0)
   and (coalesce(options->>'interest','')='' or exists(select 1 from marriage.member_interests where member_id=p.member_id and interest_code=options->>'interest'))
   and (coalesce(options->>'maritalStatus','')='' or b.marital_status=options->>'maritalStatus')
   and (coalesce(options->>'smoking','')='' or b.smoking=options->>'smoking')
   and (coalesce(options->>'dressStyle','')='' or marriage.basics_json(p.member_id)->>'dressStyle'=options->>'dressStyle')
   and (coalesce(options->>'work','')='' or exists(select 1 from marriage.members m where m.id=p.member_id and m.directory_work_choice=options->>'work'))
   and (coalesce((options->>'availableOnly')::boolean,false)=false or marriage.active_connections(p.member_id) < marriage.connection_limit(p.member_id))
   and (coalesce((options->>'minFit')::int,0)=0 or (f.fit->>'percentage')::int >= (options->>'minFit')::int)
   and not exists(select 1 from marriage.member_requests r where me in(r.requester_id,r.recipient_id) and p.member_id in(r.requester_id,r.recipient_id) and r.status in('closed','cancelled','declined') and marriage.request_suppresses_discovery(r))
   and not exists(select 1 from marriage.introductions i where i.member_a=least(me,p.member_id) and i.member_b=greatest(me,p.member_id))
 ), directory_page as (
   select *,null::bigint as position from eligible where not recommending and luna_rank>=0
   order by case when options->>'sort'='youngest' then age end asc,
     case when options->>'sort'='oldest' then age end desc,luna_rank desc,rank_value desc,member_id
   limit 24 offset skip
 ), ranked as (
   select e.*,row_number() over (order by distance,
     case when prefer_week then weekly.slot end nulls last,
     case when options->>'sort'='youngest' then age end asc,
     case when options->>'sort'='oldest' then age end desc,luna_rank desc,rank_value desc,e.member_id) as position
   from eligible e left join marriage.weekly_candidates weekly on prefer_week and weekly.member_id=me
     and weekly.week_start=marriage.current_week() and weekly.candidate_id=e.member_id
   where recommending and luna_rank>=0 and (distance=0 or (allow_close and distance=1))
 ), shortlist as materialized (
   select * from ranked where position<=5 and (distance=0 or position<=3)
 ), recommended_page as (
   select * from shortlist where (options->>'subjectId' is null or member_id=(options->>'subjectId')::uuid)
     and (nullif(options->>'afterId','') is null or position>(
       select cursor.position from shortlist cursor where cursor.member_id=(options->>'afterId')::uuid))
   order by position offset skip
 ), page as (
   select * from directory_page union all select * from recommended_page
 )
 select coalesce(jsonb_agg((case when can_request then marriage.discovery_card(me,member_id,recommending)
     else marriage.discovery_card(me,member_id,false)-array['portrait','beenaStory'] end)
     ||jsonb_build_object('eligible',can_request)
     ||case when distance=1 then jsonb_build_object('recommendationKind','close') else '{}'::jsonb end
   order by position,case when options->>'sort'='youngest' then age end asc,
     case when options->>'sort'='oldest' then age end desc,luna_rank desc,rank_value desc,member_id),'[]') from page);
end $function$;

-- Legacy native clients cannot label close results. Preserve their fixed weekly
-- roster and pagination while rechecking saved boundaries on every read.
do $legacy$
declare previous text:=pg_get_functiondef('marriage.discover(integer,integer,text,uuid)'::regprocedure);
  anchor text:='and marriage.compatible(me,s.candidate_id)';
begin
 if strpos(previous,anchor)=0 then raise exception 'Unexpected legacy discovery definition'; end if;
 execute replace(previous,anchor,anchor||' and marriage.recommendation_distance(me,s.candidate_id)=0');
end $legacy$;
