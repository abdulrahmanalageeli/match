-- Appearance is self-reported and optional. Illustrations are separately chosen;
-- no image analysis, tone hierarchy, or assumed willingness to change clothing.
alter table marriage.member_basics
 add column skin_tone text check(skin_tone in('tone_1','tone_2','tone_3','tone_4','tone_5','tone_6','tone_7','tone_8')),
 add column dress_style text check(dress_style in('hijab','niqab','uncovered')),
 add column dress_flexibility text check(dress_flexibility in('keep','open_to_discussion','prefer_not_to_say'));
alter table marriage.partner_criteria drop constraint partner_criteria_criterion_check;
alter table marriage.partner_criteria add constraint partner_criteria_criterion_check
 check(criterion in('height','weight','tribalBackground','maritalStatus','children','smoking','skinTone','dressStyle','dressFlexibility'));
create table marriage.member_public_avatars (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 style text not null check(style in('hijab','niqab','uncovered')),
 skin_tone text not null check(skin_tone in('tone_1','tone_2','tone_3','tone_4','tone_5','tone_6','tone_7','tone_8'))
);
alter table marriage.member_public_avatars enable row level security;
revoke all on marriage.member_public_avatars from public,anon,authenticated,service_role;

create or replace function marriage.basics_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_strip_nulls(jsonb_build_object('heightCm',height_cm,'weightKg',weight_kg,
 'tribalBackground',tribal_background,'tribeName',tribe_name,'nationality',nationality,
 'maritalStatus',marital_status,'childrenCount',children_count,'smoking',smoking,
 'skinTone',skin_tone,'dressStyle',dress_style,'dressFlexibility',dress_flexibility)) from marriage.member_basics where member_id=target),'{}')
$$;
create function marriage.public_avatar_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('style',style,'skinTone',skin_tone) from marriage.member_public_avatars where member_id=target),'null')
$$;
create function marriage.normalize_public_avatar(avatar jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if avatar='null'::jsonb then return avatar; end if;
 if jsonb_typeof(avatar) is distinct from 'object' then raise exception 'تحقق من الصورة الرمزية المختارة.' using errcode='22023'; end if;
 if not(avatar ?& array['style','skinTone']) or exists(select 1 from jsonb_object_keys(avatar) k where k not in('style','skinTone'))
   or jsonb_typeof(avatar->'style') is distinct from 'string' or jsonb_typeof(avatar->'skinTone') is distinct from 'string'
   or avatar->>'style' not in('hijab','niqab','uncovered')
   or avatar->>'skinTone' not in('tone_1','tone_2','tone_3','tone_4','tone_5','tone_6','tone_7','tone_8') then
  raise exception 'تحقق من الصورة الرمزية المختارة.' using errcode='22023';
 end if;
 return avatar;
end $$;

alter function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) rename to normalize_marriage_extras_before_appearance;
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; extra_basics jsonb:='{}'; extra_criteria jsonb:='{}'; k text; r jsonb; allowed text[];
begin
 result:=marriage.normalize_marriage_extras_before_appearance(basics-array['skinTone','dressStyle','dressFlexibility'],
  criteria-array['skinTone','dressStyle','dressFlexibility'],personality,version);
 for k,r in select key,value from jsonb_each(basics) where key in('skinTone','dressStyle','dressFlexibility') loop
  allowed:=case k when 'skinTone' then array['tone_1','tone_2','tone_3','tone_4','tone_5','tone_6','tone_7','tone_8']
   when 'dressStyle' then array['hijab','niqab','uncovered'] else array['keep','open_to_discussion','prefer_not_to_say'] end;
  if jsonb_typeof(r)<>'string' or (r#>>'{}')<>all(allowed) then raise exception 'تحقق من خيارات المظهر واللباس.' using errcode='22023'; end if;
  extra_basics:=extra_basics||jsonb_build_object(k,r);
 end loop;
 for k,r in select key,value from jsonb_each(criteria) where key in('skinTone','dressStyle','dressFlexibility') loop
  if jsonb_typeof(r)<>'object' or coalesce(r->>'mode','') not in('any','prefer','require') then
   raise exception 'تحقق من تفضيلات المظهر واللباس.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(r) f where f<>all(case when k='dressFlexibility' then array['mode','target'] else array['mode','values'] end)) then
   raise exception 'حقل غير معروف في تفضيلات المظهر.' using errcode='22023';
  end if;
  if r->>'mode'='any' then r:='{"mode":"any"}';
  elsif k='dressFlexibility' then
   if r->>'target' is distinct from 'open_to_discussion' then raise exception 'حدد تفضيل النقاش حول اللباس.' using errcode='22023'; end if;
  else
   allowed:=case k when 'skinTone' then array['tone_1','tone_2','tone_3','tone_4','tone_5','tone_6','tone_7','tone_8'] else array['hijab','niqab','uncovered'] end;
   if jsonb_typeof(r->'values') is distinct from 'array' then raise exception 'حدد الخيارات المقبولة لهذا التفضيل.' using errcode='22023'; end if;
   if jsonb_array_length(r->'values') not between 1 and cardinality(allowed)
    or exists(select 1 from jsonb_array_elements(r->'values') v where jsonb_typeof(v)<>'string' or (v#>>'{}')<>all(allowed))
    or exists(select 1 from jsonb_array_elements(r->'values') v group by v having count(*)>1) then
    raise exception 'تحقق من الخيارات المقبولة لهذا التفضيل.' using errcode='22023';
   end if;
  end if;
  extra_criteria:=extra_criteria||jsonb_build_object(k,r);
 end loop;
 return result||jsonb_build_object('marriageBasics',(result->'marriageBasics')||extra_basics,'partnerCriteria',(result->'partnerCriteria')||extra_criteria);
end $$;

alter function marriage.criterion_fit(uuid,uuid,text,jsonb) rename to criterion_fit_before_appearance;
create function marriage.criterion_fit(asker uuid,peer uuid,kind text,rule jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare b marriage.member_basics;
begin
 if kind not in('skinTone','dressStyle','dressFlexibility') then return marriage.criterion_fit_before_appearance(asker,peer,kind,rule); end if;
 if rule->>'mode'='any' then return null; end if;
 select * into b from marriage.member_basics where member_id=peer;
 if kind='skinTone' then
  if b.skin_tone is null then return null; end if;
  return rule->'values' ? b.skin_tone;
 elsif kind='dressStyle' then
  if b.dress_style is null then return null; end if;
  return rule->'values' ? b.dress_style;
 end if;
 if b.dress_flexibility is null or b.dress_flexibility='prefer_not_to_say' then return null; end if;
 return b.dress_flexibility='open_to_discussion';
end $$;

alter function marriage.profile_json(uuid) rename to profile_json_before_appearance;
create function marriage.profile_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.profile_json_before_appearance(target)||jsonb_build_object('publicAvatar',marriage.public_avatar_json(target),'appearanceVersion','appearance-v1')
$$;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_appearance;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.member_card_before_appearance(viewer,subject)||jsonb_build_object('publicAvatar',marriage.public_avatar_json(subject))
$$;
alter function marriage.admin_member(uuid) rename to admin_member_before_appearance;
create function marriage.admin_member(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=marriage.admin_member_before_appearance(target);
 return result||jsonb_build_object('publicAvatar',marriage.public_avatar_json(target));
end $$;
revoke all on function marriage.public_avatar_json(uuid),marriage.normalize_public_avatar(jsonb),
 marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text),marriage.criterion_fit(uuid,uuid,text,jsonb),marriage.profile_json(uuid),
 marriage.member_card(uuid,uuid),marriage.admin_member(uuid),marriage.admin_member_before_appearance(uuid)
 from public,anon,authenticated,service_role;
grant execute on function marriage.admin_member(uuid) to authenticated;

create or replace function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me uuid:=marriage.require_member(); previous jsonb; normalized jsonb; extras jsonb; basics jsonb; requested_basics jsonb; requested_criteria jsonb; avatar jsonb;
 choices jsonb; answers jsonb; hard jsonb; priorities jsonb; version text; city uuid;
 old_status text; is_suspended boolean; changed boolean; review_change boolean;
 private_keys text[]:=array['interestIds','surveyAnswers','hardRequirements','priorityCategories','assessmentVersion','preferredMinAge','preferredMaxAge','partnerCriteria','personalityAnswers','personalityVersion','appearanceVersion'];
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
 if payload ? 'appearanceVersion' and payload->>'appearanceVersion' is distinct from 'appearance-v1' then
  raise exception 'حدّث التطبيق لتعديل خيارات المظهر.' using errcode='22023';
 end if;
 requested_basics:=coalesce(payload->'marriageBasics',previous->'marriageBasics','{}');
 requested_criteria:=coalesce(payload->'partnerCriteria',previous->'partnerCriteria','{}');
 -- Earlier clients know the basics object but not the appearance fields. Their
 -- full-object saves preserve these new choices. New clients can clear them.
 if payload->>'appearanceVersion' is distinct from 'appearance-v1' then
  requested_basics:=coalesce((select jsonb_object_agg(key,value) from jsonb_each(previous->'marriageBasics') where key in('skinTone','dressStyle','dressFlexibility')),'{}')||requested_basics;
  requested_criteria:=coalesce((select jsonb_object_agg(key,value) from jsonb_each(previous->'partnerCriteria') where key in('skinTone','dressStyle','dressFlexibility')),'{}')||requested_criteria;
 end if;
 extras:=marriage.normalize_marriage_extras(requested_basics,requested_criteria,
  coalesce(payload->'personalityAnswers',previous->'personalityAnswers','{}'),
  coalesce(payload->>'personalityVersion',previous->>'personalityVersion','personality-v1'));
 avatar:=marriage.normalize_public_avatar(coalesce(payload->'publicAvatar',previous->'publicAvatar','null'));
 extras:=extras||jsonb_build_object('publicAvatar',avatar,'appearanceVersion','appearance-v1');
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
   insert into marriage.member_basics(member_id,height_cm,weight_kg,tribal_background,tribe_name,nationality,marital_status,children_count,smoking,skin_tone,dress_style,dress_flexibility)
    values(me,(basics->>'heightCm')::smallint,(basics->>'weightKg')::smallint,basics->>'tribalBackground',basics->>'tribeName',
     basics->>'nationality',basics->>'maritalStatus',(basics->>'childrenCount')::smallint,basics->>'smoking',basics->>'skinTone',basics->>'dressStyle',basics->>'dressFlexibility')
    on conflict(member_id) do update set height_cm=excluded.height_cm,weight_kg=excluded.weight_kg,
     tribal_background=excluded.tribal_background,tribe_name=excluded.tribe_name,nationality=excluded.nationality,
     marital_status=excluded.marital_status,children_count=excluded.children_count,smoking=excluded.smoking,
     skin_tone=excluded.skin_tone,dress_style=excluded.dress_style,dress_flexibility=excluded.dress_flexibility;
  end if;
  if avatar='null'::jsonb then
   delete from marriage.member_public_avatars where member_id=me;
  else
   insert into marriage.member_public_avatars(member_id,style,skin_tone) values(me,avatar->>'style',avatar->>'skinTone')
    on conflict(member_id) do update set style=excluded.style,skin_tone=excluded.skin_tone;
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

