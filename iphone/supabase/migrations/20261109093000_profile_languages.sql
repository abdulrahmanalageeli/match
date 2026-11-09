-- Optional public language answers; existing accounts remain unanswered.
alter table marriage.member_basics add column language_details jsonb not null default '{}'::jsonb;
alter function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) rename to normalize_marriage_extras_before_languages;
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; extra jsonb; langs text[] := ARRAY['العربية', 'الإنجليزية', 'الفرنسية', 'الإسبانية', 'الألمانية', 'التركية', 'الأردية', 'الفارسية', 'الهندية', 'البنغالية', 'الإندونيسية', 'الملايوية', 'الصينية', 'الروسية', 'السواحيلية', 'لغة الإشارة'];
begin
 result:=marriage.normalize_marriage_extras_before_languages(basics-array['spokenLanguages','preferredLanguage','languageOpenness'],criteria,personality,version);
 select coalesce(jsonb_object_agg(key,value),'{}') into extra from jsonb_each(basics) where key in('spokenLanguages','preferredLanguage','languageOpenness');
 if extra ? 'spokenLanguages' then
  if jsonb_typeof(extra->'spokenLanguages') <> 'array' then raise exception 'Invalid languages'; end if;
  if jsonb_array_length(extra->'spokenLanguages')>cardinality(langs) or exists(select 1 from jsonb_array_elements(extra->'spokenLanguages') v where jsonb_typeof(v)<>'string' or not ((v#>>'{}')=any(langs))) or exists(select 1 from jsonb_array_elements(extra->'spokenLanguages') v group by v having count(*)>1) then raise exception 'Invalid languages'; end if;
 end if;
 if extra ? 'preferredLanguage' and (jsonb_typeof(extra->'preferredLanguage')<>'string' or not ((extra->>'preferredLanguage')=any(langs))) then raise exception 'Invalid preferred language'; end if;
 if extra ? 'languageOpenness' and (jsonb_typeof(extra->'languageOpenness')<>'string' or extra->>'languageOpenness' not in('shared_required','open_to_learning','flexible')) then raise exception 'Invalid language preference'; end if;
 return jsonb_set(result,'{marriageBasics}',(result->'marriageBasics')||extra);
end $$;
alter function marriage.basics_json(uuid) rename to basics_json_before_languages;
create function marriage.basics_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.basics_json_before_languages(target)||coalesce((select language_details from marriage.member_basics where member_id=target),'{}')
$$;
do $migration$ declare definition text; begin
 definition:=pg_get_functiondef('marriage.apply_profile_before_onboarding_consent(jsonb)'::regprocedure);
 if position('marriage_timeline,meeting_preference)' in definition)=0 then raise exception 'Unexpected writer'; end if;
 definition:=replace(definition,'marriage_timeline,meeting_preference)','marriage_timeline,meeting_preference,language_details)');
 definition:=replace(definition,$q$basics->>'meetingPreference')$q$,$q$basics->>'meetingPreference', (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(basics) where key in('spokenLanguages','preferredLanguage','languageOpenness')))$q$);
 definition:=replace(definition,'meeting_preference=excluded.meeting_preference;','meeting_preference=excluded.meeting_preference,language_details=excluded.language_details;');
 execute definition;
end $migration$;
revoke all on function marriage.normalize_marriage_extras_before_languages(jsonb,jsonb,jsonb,text), marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text), marriage.basics_json_before_languages(uuid), marriage.basics_json(uuid) from public,anon,authenticated,service_role;
