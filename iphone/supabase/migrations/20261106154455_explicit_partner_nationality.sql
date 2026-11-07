-- Explicit partner nationality choices are private and independent of own identity.
alter table marriage.partner_criteria drop constraint partner_criteria_criterion_check;
alter table marriage.partner_criteria add constraint partner_criteria_criterion_check check
 (criterion in('height','weight','tribalBackground','nationality','maritalStatus','children','smoking','skinTone','dressStyle','dressFlexibility'));
create function marriage.normalize_nationality(value text) returns text language sql immutable set search_path='' as $$
 with cleaned as(select regexp_replace(regexp_replace(translate(regexp_replace(lower(btrim(value)),'[ً-ٰٟـ]','','g'),'أإآ','ااا'),'ة$',''),'\s+',' ','g') as n)
 select case n
 when 'السعودي' then 'سعودي'
 when 'المملكة العربية السعودي' then 'سعودي'
 when 'saudi' then 'سعودي'
 when 'saudi arabia' then 'سعودي'
 when 'saudi arabian' then 'سعودي'
 when 'الامارات' then 'اماراتي'
 when 'الامارات العربية المتحد' then 'اماراتي'
 when 'emirati' then 'اماراتي'
 when 'uae' then 'اماراتي'
 when 'الكويت' then 'كويتي'
 when 'kuwaiti' then 'كويتي'
 when 'قطر' then 'قطري'
 when 'qatari' then 'قطري'
 when 'البحرين' then 'بحريني'
 when 'bahraini' then 'بحريني'
 when 'عمان' then 'عماني'
 when 'omani' then 'عماني'
 when 'اليمن' then 'يمني'
 when 'yemeni' then 'يمني'
 when 'مصر' then 'مصري'
 when 'egyptian' then 'مصري'
 when 'الاردن' then 'اردني'
 when 'jordanian' then 'اردني'
 when 'فلسطين' then 'فلسطيني'
 when 'palestinian' then 'فلسطيني'
 when 'سوريا' then 'سوري'
 when 'syrian' then 'سوري'
 when 'لبنان' then 'لبناني'
 when 'lebanese' then 'لبناني'
 when 'العراق' then 'عراقي'
 when 'iraqi' then 'عراقي'
 when 'السودان' then 'سوداني'
 when 'sudanese' then 'سوداني'
 when 'المغرب' then 'مغربي'
 when 'moroccan' then 'مغربي'
 when 'الجزائر' then 'جزائري'
 when 'algerian' then 'جزائري'
 when 'تونس' then 'تونسي'
 when 'tunisian' then 'تونسي'
 when 'ليبيا' then 'ليبي'
 when 'libyan' then 'ليبي'
 when 'موريتانيا' then 'موريتاني'
 when 'mauritanian' then 'موريتاني'
 when 'الصومال' then 'صومالي'
 when 'somali' then 'صومالي'
 else n end from cleaned
$$;
revoke all on function marriage.normalize_nationality(text) from public,anon,authenticated,service_role;

alter function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) rename to normalize_marriage_extras_before_nationality;
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; rule jsonb; normalized jsonb;begin
 result:=marriage.normalize_marriage_extras_before_nationality(basics,criteria-'nationality',personality,version);
 if not(criteria?'nationality') then return result;end if;
 rule:=criteria->'nationality';
 if jsonb_typeof(rule) is distinct from 'object' or coalesce(rule->>'mode','') not in('any','prefer','require') then
  raise exception 'تحقق من تفضيلات جنسية الشريك.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(rule) k where k not in('mode','values','exclude')) or
  (rule?'exclude' and jsonb_typeof(rule->'exclude') is distinct from 'boolean') then
  raise exception 'تحقق من تفضيلات جنسية الشريك.' using errcode='22023';end if;
 if rule->>'mode'='any' then rule:='{"mode":"any"}';else
  if jsonb_typeof(rule->'values') is distinct from 'array' then raise exception 'اختر جنسية واحدة على الأقل.' using errcode='22023';end if;
  if jsonb_array_length(rule->'values') not between 1 and 30 or exists(select 1 from jsonb_array_elements(rule->'values') v
   where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 80) then
   raise exception 'تحقق من الجنسيات المختارة.' using errcode='22023';end if;
  select jsonb_agg(v order by v) into normalized from (select distinct marriage.normalize_nationality(value) as v from jsonb_array_elements_text(rule->'values')) n;
  rule:=jsonb_build_object('mode',rule->>'mode','values',normalized,'exclude',coalesce((rule->>'exclude')::boolean,false));
 end if;
 return jsonb_set(result,'{partnerCriteria}',(result->'partnerCriteria')||jsonb_build_object('nationality',rule));
end $$;
revoke all on function marriage.normalize_marriage_extras_before_nationality(jsonb,jsonb,jsonb,text),marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) from public,anon,authenticated,service_role;

alter function marriage.criterion_fit(uuid,uuid,text,jsonb) rename to criterion_fit_before_nationality;
create function marriage.criterion_fit(asker uuid,peer uuid,kind text,rule jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare nationality text; included boolean;begin
 if kind<>'nationality' then return marriage.criterion_fit_before_nationality(asker,peer,kind,rule);end if;
 if rule->>'mode'='any' then return null;end if;
 select marriage.normalize_nationality(b.nationality) into nationality from marriage.member_basics b where b.member_id=peer;
 if coalesce(nationality,'')='' then return null;end if;
 select exists(select 1 from jsonb_array_elements_text(rule->'values') v where marriage.normalize_nationality(v)=nationality) into included;
 return case when coalesce((rule->>'exclude')::boolean,false) then not included else included end;
end $$;
revoke all on function marriage.criterion_fit_before_nationality(uuid,uuid,text,jsonb),marriage.criterion_fit(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
