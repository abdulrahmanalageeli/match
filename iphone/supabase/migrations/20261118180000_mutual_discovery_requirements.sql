-- Private relocation destinations are used only for a member who explicitly chooses
-- "a city we agree on". Keeping these on preferences also preserves account deletion.
alter table marriage.preferences add column relocation_cities text[] not null default '{}';
create function public.marriage_relocation_cities(destinations text[] default null) returns text[]
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); result text[];
begin
 if destinations is not null then
  if coalesce(array_ndims(destinations),1)<>1 or cardinality(destinations)>20 or exists(
    select 1 from unnest(destinations) d where d is null or length(trim(d)) not between 2 and 80
    or marriage.city_filter_key(d) in ('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه')) then
    raise exception 'اختر مدنًا محددة للانتقال.' using errcode='22023';
  end if;
  update marriage.preferences set relocation_cities=array(select distinct trim(d) from unnest(destinations) d order by 1) where member_id=me;
 end if;
 select relocation_cities into strict result from marriage.preferences where member_id=me;
 return result;
end $$;
revoke all on function public.marriage_relocation_cities(text[]) from public,anon,service_role;
grant execute on function public.marriage_relocation_cities(text[]) to authenticated;

create or replace function marriage.common_city_possible(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 with residents as (
  select p.member_id, c.label city, r.option_code plan, prefs.relocation_cities destinations
  from marriage.profiles p join marriage.cities c on c.id=p.city_id join marriage.preferences prefs using(member_id)
  join marriage.member_answers r on r.member_id=p.member_id and r.question_code='residence_plan'
  where p.member_id in(a,b) and r.option_code in('A','B','C')
 ), choices as (
  select x.member_id,marriage.city_filter_key(d) city from residents x join residents y on x.member_id<>y.member_id
  cross join lateral unnest(array[x.city]||case x.plan when 'B' then array[y.city] when 'C' then x.destinations else '{}'::text[] end) d
 ) select exists(select 1 from choices x join choices y using(city) where x.member_id<>y.member_id and x.city not in('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه'))
$$;

-- Explicit overlapping windows extend the formal-step questionnaire. Existing
-- single-window answers, including "undecided", retain their original meaning.
insert into marriage.question_options select q,code,label,pos from
 unnest(array['marriage_timeline','partner_marriage_timeline']) q cross join
 (values('E','أي وقت خلال السنة الأولى',5),('F','يناسبني أي موعد محدد',6)) v(code,label,pos);
update marriage.assessment_versions set catalog=jsonb_set(catalog,'{dimensions}',(
 select jsonb_agg(case when d->>'id'='marriage_timeline' then d||jsonb_build_object(
 'partnerPrompt','ما توقيت أول خطوة رسمية الذي يناسبك لدى الطرف الآخر؟',
 'partnerDefault',d->'partnerDefault'||'{"E":"E","F":"F"}'::jsonb,'options',d->'options'||
 '[{"code":"E","self":"أي وقت خلال السنة الأولى","partner":"أي وقت خلال السنة الأولى"},{"code":"F","self":"يناسبني أي موعد محدد","partner":"يناسبني أي موعد محدد"}]'::jsonb) else d end order by n)
 from jsonb_array_elements(catalog->'dimensions') with ordinality t(d,n))) where id='marriage-v2';
create function marriage.formal_windows(answer text) returns text[] language sql immutable strict set search_path='' as $$
 select case answer when 'E' then array['A','B'] when 'F' then array['A','B','C'] else array[answer] end
$$;

create function marriage.polygyny_accepted(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from marriage.profiles w join marriage.member_basics wb using(member_id)
 left join marriage.member_basics mb on mb.member_id=case when w.member_id=a then b else a end
 where w.member_id in(a,b) and w.gender='woman' and wb.polygyny_preference='not_open'
 and (mb.marital_status in('never_married','divorced','widowed') and mb.polygyny_preference='not_open') is not true)
$$;
-- Fresh discovery always checks requirements. Established conversations keep their
-- own continuity exception in compatible_before_basics and compatible_before_exclusivity.
create function marriage.new_pair_requirements(a uuid,b uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from marriage.profiles p join marriage.preferences xp on xp.member_id=p.member_id
 join marriage.profiles q on q.member_id=b join marriage.preferences yp on yp.member_id=q.member_id
 join marriage.cities pc on pc.id=p.city_id join marriage.cities qc on qc.id=q.city_id
 where p.member_id=a and q.age between xp.min_age and xp.max_age and p.age between yp.min_age and yp.max_age
 and ((marriage.city_filter_key(pc.label)=marriage.city_filter_key(qc.label) and marriage.city_filter_key(pc.label) not in ('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه')) or marriage.common_city_possible(a,b))
 and marriage.polygyny_accepted(a,b) and marriage.criteria_accepted(a,b)
 and not exists(select 1 from marriage.fit_hard_requirements h join marriage.fit_dimensions d on d.code=h.dimension
 left join marriage.member_answers want on want.member_id=h.member_id and want.question_code=d.partner_code
 left join marriage.member_answers peer on peer.member_id=case when h.member_id=a then b else a end and peer.question_code=d.code
 where h.member_id in(a,b) and marriage.preference_answer_fit(d.code,h.member_id,peer.member_id,want.option_code,peer.option_code) is not true))
$$;
revoke all on function marriage.formal_windows(text),marriage.polygyny_accepted(uuid,uuid),marriage.new_pair_requirements(uuid,uuid) from public,anon,authenticated,service_role;

create function marriage.request_suppresses_discovery(r marriage.member_requests) returns boolean language sql immutable set search_path='' as $$
 select not ((r.status='cancelled' and r.allow_rematch) or (r.status='closed' and r.closure_outcome is not distinct from 'expired'))
$$;
revoke all on function marriage.request_suppresses_discovery(marriage.member_requests) from public,anon,authenticated,service_role;

-- A biography may rank a preference. Only a declared, published field may verify
-- a mandatory criterion. Missing fields and unsupported strict conditions fail closed.
create or replace function marriage.luna_score(card jsonb,plan jsonb) returns integer language plpgsql stable set search_path='' as $$
declare criterion jsonb; kind text; field text; vals jsonb; hit boolean; score integer:=0;
 haystack text:=marriage.luna_normalize(concat_ws(' ',card->>'bio',card->>'occupation',card->>'education',card->>'city',card->>'interests',card->>'about',card->>'marriageBasics'));
begin
 if plan is null then return 0;end if;
 if jsonb_typeof(plan)<>'array' or jsonb_array_length(plan)>10 or length(plan::text)>14000 then raise exception 'Invalid search plan' using errcode='22023';end if;
 for criterion in select value from jsonb_array_elements(plan) loop
  kind:=criterion->>'kind'; field:=criterion->>'field';
  if kind is null or kind not in('must','prefer','exclude') or jsonb_typeof(criterion->'terms') is distinct from 'array' or jsonb_array_length(criterion->'terms') not between 1 and 8 then raise exception 'Invalid search criterion' using errcode='22023';end if;
  if kind='prefer' then
   if exists(select 1 from jsonb_array_elements_text(criterion->'terms') t where length(trim(t)) between 2 and 80 and strpos(haystack,marriage.luna_normalize(t))>0) then score:=score+1;end if;
   continue;
  end if;
  vals:=case field when 'interest' then card->'interests' when 'language' then card#>'{marriageBasics,spokenLanguages}'
    when 'education' then jsonb_build_array(marriage.structured_profile_value('education',card->>'education'))
    when 'profession' then jsonb_build_array(marriage.structured_profile_value('profession',card->>'occupation'))
    when 'city' then jsonb_build_array(card->>'city')
    when 'smoking' then jsonb_build_array(card#>>'{marriageBasics,smoking}') when 'maritalStatus' then jsonb_build_array(card#>>'{marriageBasics,maritalStatus}') end;
  if vals is null or jsonb_typeof(vals)<>'array' or not exists(select 1 from jsonb_array_elements_text(vals) v where nullif(trim(v),'') is not null and (field<>'city' or marriage.city_filter_key(v) not in('مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه'))) then return -1;end if;
  -- Omission from a list of interests or languages cannot confirm an exclusion.
  if kind='exclude' and field in('interest','language') then return -1;end if;
  if kind='exclude' and exists(select 1 from jsonb_array_elements_text(criterion->'terms') t where
    (case field when 'smoking' then t in('never','cigarettes','vape','shisha','sometimes','yes') when 'maritalStatus' then t in('never_married','divorced','widowed','married')
     when 'education' then t=any(marriage.structured_profile_choices('education')) when 'profession' then t=any(marriage.structured_profile_choices('profession'))
     when 'city' then exists(select 1 from marriage.cities c where marriage.city_filter_key(c.label)=marriage.city_filter_key(t)) else false end) is not true) then return -1;end if;
  if kind='exclude' and field='smoking' and vals->>0 in('sometimes','yes') and (criterion->'terms') ?| array['cigarettes','vape','shisha'] then return -1;end if;
  select exists(select 1 from jsonb_array_elements_text(vals) v cross join jsonb_array_elements_text(criterion->'terms') t where length(trim(t)) between 2 and 80 and
    case when field='city' then marriage.city_filter_key(v)=marriage.city_filter_key(t) else marriage.luna_normalize(v)=marriage.luna_normalize(trim(t)) end) into hit;
  if (kind='must' and not hit) or (kind='exclude' and hit) then return -1;end if;
 end loop;
 return score;
end $$;

-- Modify the installed RPCs in place so grants, membership, moderation, and
-- consent checks are preserved. Refuse partially matching procedure versions.
do $migration$
declare change record; definition text;
begin
 for change in select * from (values
  ('marriage.compatible_before_basics(uuid,uuid)', $old$(p.age between yp.min_age and yp.max_age and q.age between xp.min_age and xp.max_age
     and (exists(select 1 from marriage.cities city_a cross join marriage.cities city_b
    where city_a.id=p.city_id and city_b.id=q.city_id
     and marriage.city_filter_key(city_a.label) not in('مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه')
     and marriage.city_filter_key(city_a.label)=marriage.city_filter_key(city_b.label)) or marriage.common_city_possible(a,b))
     and not exists (
       select 1 from marriage.fit_hard_requirements h join marriage.fit_dimensions d on d.code=h.dimension
       left join marriage.member_answers want on want.member_id=h.member_id and want.question_code=d.partner_code
       left join marriage.member_answers peer on peer.member_id=case when h.member_id=a then b else a end and peer.question_code=d.code
       where h.member_id in(a,b) and (marriage.preference_answer_fit(d.code,h.member_id,case when h.member_id=a then b else a end,want.option_code,peer.option_code) is not true)
     )
   )$old$, $new$marriage.new_pair_requirements(a,b)$new$),
  ('marriage.compatible_before_exclusivity(uuid,uuid)', $old$select marriage.compatible_before_basics(a,b) and (
  exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(a,b)
   and greatest(r.requester_id,r.recipient_id)=greatest(a,b) and r.status='accepted')
  or exists(select 1 from marriage.introductions i join marriage.introduction_decisions da on da.introduction_id=i.id and da.member_id=a
   join marriage.introduction_decisions db on db.introduction_id=i.id and db.member_id=b where i.member_a=least(a,b) and i.member_b=greatest(a,b) and i.closed_at is null)
  or marriage.criteria_accepted(a,b))$old$, $new$select marriage.compatible_before_basics(a,b)$new$),
  ('marriage.preference_answer_fit(text,uuid,uuid,text,text)', $old$when dimension='residence_plan'$old$, $new$when dimension='marriage_timeline' then marriage.formal_windows(wanted) && marriage.formal_windows(observed)
  when dimension='residence_plan'$new$),
  ('marriage.interview_document_valid_before_partner_defaults(jsonb)', $old$preference:marriage_timeline:self","values":["A","B","C","D"]$old$, $new$preference:marriage_timeline:self","values":["A","B","C","D","E","F"]$new$),
  ('marriage.interview_document_valid_before_partner_defaults(jsonb)', $old$preference:marriage_timeline:partner","values":["A","B","C","D"]$old$, $new$preference:marriage_timeline:partner","values":["A","B","C","D","E","F"]$new$),
  ('marriage.browse(jsonb)', $old$not(r.status='cancelled' and r.allow_rematch)$old$, $new$marriage.request_suppresses_discovery(r)$new$),
  ('marriage.discover(integer,integer,text,uuid)', $old$not(r.status='cancelled' and r.allow_rematch)$old$, $new$marriage.request_suppresses_discovery(r)$new$),
  ('marriage.discovery_action(uuid,text,text)', $old$not(r.status='cancelled' and r.allow_rematch)$old$, $new$marriage.request_suppresses_discovery(r)$new$),
  ('marriage.browse(jsonb)', $old$if options->>'mode'='recommended' then perform$old$, $new$perform marriage.expire_my_requests(); if options->>'mode'='recommended' then perform$new$),
  ('marriage.request_member(uuid)', $old$not(x.status='cancelled' and x.allow_rematch)$old$, $new$marriage.request_suppresses_discovery(x)$new$),
  ('marriage.can_offer(uuid,uuid)', $old$greatest(r.requester_id,r.recipient_id)=greatest(a,b))$old$, $new$greatest(r.requester_id,r.recipient_id)=greatest(a,b) and marriage.request_suppresses_discovery(r))$new$),
  ('marriage.ranked_week(uuid,date)', $old$greatest(r.requester_id,r.recipient_id)=greatest(target,p.member_id))$old$, $new$greatest(r.requester_id,r.recipient_id)=greatest(target,p.member_id) and marriage.request_suppresses_discovery(r))$new$),
  ('marriage.guard_curated_pair()', $old$greatest(r.requester_id,r.recipient_id)=greatest(new.member_a,new.member_b))$old$, $new$greatest(r.requester_id,r.recipient_id)=greatest(new.member_a,new.member_b) and marriage.request_suppresses_discovery(r))$new$),
  ('marriage.browse(jsonb)', $old$f.rank_value + case when marriage.is_serious(p.member_id) then 0.05 else 0 end as rank_value$old$, $new$f.rank_value$new$),
  ('marriage.browse(jsonb)', $old$p.display_name ilike '%'||left(options->>'search',80)||'%' or p.profession ilike '%'||left(options->>'search',80)||'%'$old$, $new$strpos(lower(concat_ws(' ',p.display_name,p.profession,p.bio)),lower(left(options->>'search',80)))>0$new$),
  ('marriage.browse(jsonb)', $old$where p.member_id<>me$old$, $new$where p.member_id<>me and (options->>'subjectId' is null or p.member_id=(options->>'subjectId')::uuid) and (not exists(select 1 from marriage.member_requests established where established.status='accepted' and least(established.requester_id,established.recipient_id)=least(me,p.member_id) and greatest(established.requester_id,established.recipient_id)=greatest(me,p.member_id)) or marriage.new_pair_requirements(me,p.member_id))
 and (options#>>'{lunaFields,minAge}' is null or p.age >= (options#>>'{lunaFields,minAge}')::int)
 and (options#>>'{lunaFields,maxAge}' is null or p.age <= (options#>>'{lunaFields,maxAge}')::int)
 and (options#>>'{lunaFields,city}' is null or marriage.city_filter_key(c.label)=marriage.city_filter_key(options#>>'{lunaFields,city}'))
 and (options#>>'{lunaFields,smoking}' is null or b.smoking=options#>>'{lunaFields,smoking}')
 and (options#>>'{lunaFields,maritalStatus}' is null or b.marital_status=options#>>'{lunaFields,maritalStatus}')
 and (jsonb_array_length(coalesce(options->'excludeCities','[]'))=0 or marriage.city_filter_key(c.label) not in('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه'))
 and (jsonb_array_length(coalesce(options->'excludeNationalities','[]'))=0 or nullif(trim(b.nationality),'') is not null and b.nationality<>'prefer_not_to_say')
 and (jsonb_array_length(coalesce(options->'excludeTribalBackgrounds','[]'))=0 or marriage.sensitive_publication_allowed(p.member_id) and b.tribal_background in('tribal','non_tribal'))
 and (jsonb_array_length(coalesce(options->'excludeSmoking','[]'))=0 or b.smoking is not null and (b.smoking not in('sometimes','yes') or not((options->'excludeSmoking') ?| array['cigarettes','vape','shisha'])))
 and (jsonb_array_length(coalesce(options->'excludeMaritalStatuses','[]'))=0 or b.marital_status is not null)$new$)
 ) patches(signature,needle,replacement) loop
  definition:=replace(pg_get_functiondef(change.signature::regprocedure),chr(13),'');
  if strpos(definition,change.needle)=0 then raise exception 'Unexpected definition of %',change.signature;end if;
  execute replace(definition,change.needle,change.replacement);
 end loop;
end $migration$;
