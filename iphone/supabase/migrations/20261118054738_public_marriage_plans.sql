-- Optional public plans; existing answers and marriage-v2 scoring retain their meaning.
create function marriage.public_plans_valid(plans jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(plans) is distinct from 'object' then return false; end if;
 for k,v in select key,value from jsonb_each(plans) loop
  if jsonb_typeof(v) is distinct from 'string' then return false; end if;
  case k
   when 'originCity' then
    if length(btrim(v#>>'{}'))=0 or length(v#>>'{}')>80 or (v#>>'{}')~*'https?://|www[.]' then return false; end if;
   when 'weddingStyle' then if (v#>>'{}') not in('simple','moderate','larger','discuss') then return false; end if;
   when 'childrenTiming' then if (v#>>'{}') not in('first_year','after_one_two_years','after_two_years','discuss') then return false; end if;
   when 'housingPlan' then if (v#>>'{}') not in('independent','separate_family_building','with_family','discuss') then return false; end if;
   when 'expenseSharing' then if (v#>>'{}') not in('husband_essentials','proportional','equal','discuss') then return false; end if;
   else return false;
  end case;
 end loop;
 return true;
end $$;

alter table marriage.member_basics add column life_plans jsonb not null default '{}'::jsonb
 check(marriage.public_plans_valid(life_plans));
alter function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) rename to normalize_marriage_extras_before_life_plans;
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; extra jsonb; keys text[]:=array['originCity','weddingStyle','childrenTiming','housingPlan','expenseSharing'];
begin
 result:=marriage.normalize_marriage_extras_before_life_plans(basics-keys,criteria,personality,version);
 select coalesce(jsonb_object_agg(key,value),'{}') into extra from jsonb_each(basics) where key=any(keys);
 if not marriage.public_plans_valid(extra) then raise exception 'راجع مدينة الأصل وخيارات خطط الحياة الزوجية.' using errcode='22023'; end if;
 return jsonb_set(result,'{marriageBasics}',(result->'marriageBasics')||extra);
end $$;

alter function marriage.basics_json(uuid) rename to basics_json_before_life_plans;
create function marriage.basics_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.basics_json_before_life_plans(target)||coalesce((select life_plans from marriage.member_basics where member_id=target),'{}')
$$;

-- Extend the existing validated writer, preserving consent, review and ownership gates.
do $writer$ declare definition text; updated text;
begin
 definition:=pg_get_functiondef('marriage.apply_profile_before_onboarding_consent(jsonb)'::regprocedure);
 updated:=replace(definition,'meeting_preference,language_details)','meeting_preference,language_details,life_plans)');
 if updated=definition then raise exception 'Expected member basics columns missing'; end if;
 definition:=updated;
 updated:=replace(definition,$old$where key in('spokenLanguages','preferredLanguage','languageOpenness')))$old$,
 $new$where key in('spokenLanguages','preferredLanguage','languageOpenness')), (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(basics) where key in('originCity','weddingStyle','childrenTiming','housingPlan','expenseSharing')))$new$);
 if updated=definition then raise exception 'Expected member basics values missing'; end if;
 definition:=updated;
 updated:=replace(definition,'language_details=excluded.language_details;','language_details=excluded.language_details,life_plans=excluded.life_plans;');
 if updated=definition then raise exception 'Expected member basics update missing'; end if;
 execute updated;
end $writer$;

alter function marriage.interview_profile_values_valid(jsonb) rename to interview_profile_values_valid_before_life_plans;
create function marriage.interview_profile_values_valid(item jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text:=substring(item->>'fieldId' from 16);
begin
 if item->>'fieldId' not in('marriageBasics.originCity','marriageBasics.weddingStyle','marriageBasics.childrenTiming','marriageBasics.housingPlan','marriageBasics.expenseSharing') then
  return marriage.interview_profile_values_valid_before_life_plans(item);
 end if;
 if item->'mode' is distinct from 'null'::jsonb or item->'exclude' is distinct from 'false'::jsonb
  or jsonb_typeof(item->'values') is distinct from 'array' or jsonb_array_length(item->'values')<>1 then return false; end if;
 return marriage.public_plans_valid(jsonb_build_object(k,item#>'{values,0}'));
 exception when others then return false;
end $$;

revoke all on function marriage.public_plans_valid(jsonb),marriage.normalize_marriage_extras_before_life_plans(jsonb,jsonb,jsonb,text),marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text),marriage.basics_json_before_life_plans(uuid),marriage.basics_json(uuid),marriage.interview_profile_values_valid_before_life_plans(jsonb),marriage.interview_profile_values_valid(jsonb) from public,anon,authenticated,service_role;

-- Include only explicit optional plans in mutually consented reports. Origin city
-- stays a public profile fact, never a proxy for background or compatibility.
alter function marriage.deep_evidence(uuid) rename to deep_evidence_before_life_plans;
create function marriage.deep_evidence(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_set(marriage.deep_evidence_before_life_plans(target),'{entries}',
  (marriage.deep_evidence_before_life_plans(target)->'entries') || coalesce((
   select jsonb_agg(jsonb_build_object('key','profile:'||c.field,'question',c.question,'answer',c.label) order by c.field)
   from marriage.member_basics b
   join (values
('weddingStyle','simple','حفل الزواج والميزانية','حفل بسيط للأهل والمقرّبين وتكاليف محدودة'),
('weddingStyle','moderate','حفل الزواج والميزانية','حفل متوسط بميزانية متفق عليها'),
('weddingStyle','larger','حفل الزواج والميزانية','حفل أكبر مع تخصيص ميزانية مناسبة له'),
('weddingStyle','discuss','حفل الزواج والميزانية','نتفق على حجم الحفل والميزانية حسب ظروفنا'),
('childrenTiming','first_year','توقيت الإنجاب','خلال السنة الأولى من الزواج'),
('childrenTiming','after_one_two_years','توقيت الإنجاب','بعد سنة إلى سنتين'),
('childrenTiming','after_two_years','توقيت الإنجاب','بعد أكثر من سنتين'),
('childrenTiming','discuss','توقيت الإنجاب','نتفق على التوقيت عندما نكون مستعدّين'),
('housingPlan','independent','ترتيب السكن','منزل مستقل عن الأهل'),
('housingPlan','separate_family_building','ترتيب السكن','وحدة مستقلة في مبنى العائلة'),
('housingPlan','with_family','ترتيب السكن','السكن مع الأهل في المنزل نفسه'),
('housingPlan','discuss','ترتيب السكن','منفتح على الاتفاق حسب الظروف'),
('expenseSharing','husband_essentials','توزيع مصاريف البيت','الزوج يتحمّل الأساسيات، ومساهمة الزوجة اختيارية'),
('expenseSharing','proportional','توزيع مصاريف البيت','نتشارك بحسب دخل كل طرف'),
('expenseSharing','equal','توزيع مصاريف البيت','نتشارك بالتساوي — ٥٠/٥٠'),
('expenseSharing','discuss','توزيع مصاريف البيت','نتفق على التفاصيل حسب ظروفنا')
   ) c(field,code,question,label) on b.life_plans->>c.field=c.code
   where b.member_id=target
  ),'[]'::jsonb))
$$;
revoke all on function marriage.deep_evidence_before_life_plans(uuid),marriage.deep_evidence(uuid) from public,anon,authenticated,service_role;
-- A request made under the old explanation must be re-issued with the new data scope.
update marriage.deep_analyses set status='stale' where status='requested';
