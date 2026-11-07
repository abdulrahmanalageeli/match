-- Preserve the meaning of existing discussion-only answers. Willingness to
-- change is a separate, explicit choice and never implies an obligation.
alter table marriage.member_basics drop constraint member_basics_dress_flexibility_check;
alter table marriage.member_basics add constraint member_basics_dress_flexibility_check
 check(dress_flexibility in('keep','open_to_discussion','open_to_change','prefer_not_to_say'));

create or replace function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; extra_basics jsonb:='{}'; extra_criteria jsonb:='{}'; k text; r jsonb; allowed text[];
begin
 result:=marriage.normalize_marriage_extras_before_appearance(basics-array['skinTone','dressStyle','dressFlexibility'],
  criteria-array['skinTone','dressStyle','dressFlexibility'],personality,version);
 for k,r in select key,value from jsonb_each(basics) where key in('skinTone','dressStyle','dressFlexibility') loop
  allowed:=case k when 'skinTone' then array['tone_1','tone_2','tone_3','tone_4','tone_5','tone_6','tone_7','tone_8']
   when 'dressStyle' then array['hijab','niqab','uncovered'] else array['keep','open_to_discussion','open_to_change','prefer_not_to_say'] end;
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
   if coalesce(r->>'target','') not in('open_to_discussion','open_to_change') then raise exception 'حدد تفضيل النقاش حول اللباس.' using errcode='22023'; end if;
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

create or replace function marriage.criterion_fit(asker uuid,peer uuid,kind text,rule jsonb) returns boolean language plpgsql stable set search_path='' as $$
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
 if rule->>'target'='open_to_discussion' then return b.dress_flexibility in('open_to_discussion','open_to_change'); end if;
 if rule->>'target'='open_to_change' then return b.dress_flexibility='open_to_change'; end if;
 return null;
end $$;
