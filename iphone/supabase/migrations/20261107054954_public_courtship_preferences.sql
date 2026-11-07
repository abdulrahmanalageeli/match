-- Optional public choices are separate from private formal-step assessment answers.
-- Leave existing members unanswered; never infer meeting consent or a deadline.
alter table marriage.member_basics
 add column marriage_timeline text check(marriage_timeline in('within_3_months','three_to_six_months','six_to_twelve_months','over_a_year','when_ready')),
 add column meeting_preference text check(meeting_preference in('public_before_formal','family_before_formal','after_formal','discuss_together'));

alter function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) rename to normalize_marriage_extras_before_courtship;
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; extra jsonb; k text; v jsonb;
begin
 result:=marriage.normalize_marriage_extras_before_courtship(basics-array['marriageTimeline','meetingPreference'],criteria,personality,version);
 select coalesce(jsonb_object_agg(key,value),'{}') into extra from jsonb_each(basics)
  where key in('marriageTimeline','meetingPreference');
 for k,v in select key,value from jsonb_each(extra) loop
  if jsonb_typeof(v) is distinct from 'string'
   or (k='marriageTimeline' and (v#>>'{}') not in('within_3_months','three_to_six_months','six_to_twelve_months','over_a_year','when_ready'))
   or (k='meetingPreference' and (v#>>'{}') not in('public_before_formal','family_before_formal','after_formal','discuss_together')) then
   raise exception 'اختر توقيت الزواج وطريقة اللقاء من الخيارات المتاحة.' using errcode='22023';
  end if;
 end loop;
 return jsonb_set(result,'{marriageBasics}',(result->'marriageBasics')||extra);
end $$;

alter function marriage.basics_json(uuid) rename to basics_json_before_courtship;
create function marriage.basics_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select marriage.basics_json_before_courtship(target)||coalesce((select jsonb_strip_nulls(jsonb_build_object(
  'marriageTimeline',marriage_timeline,'meetingPreference',meeting_preference))
  from marriage.member_basics where member_id=target),'{}')
$$;

-- Extend the established writer so review checks and the save remain atomic.
-- The outer consent/Beena wrappers continue to use this same normalized writer.
do $courtship$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('marriage.apply_profile_before_onboarding_consent(jsonb)'::regprocedure);
 needle:='insert into marriage.member_basics(member_id,height_cm,weight_kg,tribal_background,tribe_name,nationality,marital_status,children_count,smoking,skin_tone,dress_style,dress_flexibility)';
 if position(needle in definition)=0 then raise exception 'Unexpected marriage basics writer columns';end if;
 definition:=replace(definition,needle,'insert into marriage.member_basics(member_id,height_cm,weight_kg,tribal_background,tribe_name,nationality,marital_status,children_count,smoking,skin_tone,dress_style,dress_flexibility,marriage_timeline,meeting_preference)');
 needle:=$q$basics->>'skinTone',basics->>'dressStyle',basics->>'dressFlexibility')$q$;
 if position(needle in definition)=0 then raise exception 'Unexpected marriage basics writer values';end if;
 definition:=replace(definition,needle,$q$basics->>'skinTone',basics->>'dressStyle',basics->>'dressFlexibility',basics->>'marriageTimeline',basics->>'meetingPreference')$q$);
 needle:='dress_flexibility=excluded.dress_flexibility;';
 if position(needle in definition)=0 then raise exception 'Unexpected marriage basics update clause';end if;
 definition:=replace(definition,needle,'dress_flexibility=excluded.dress_flexibility,marriage_timeline=excluded.marriage_timeline,meeting_preference=excluded.meeting_preference;');
 execute definition;
end $courtship$;

revoke all on function marriage.normalize_marriage_extras_before_courtship(jsonb,jsonb,jsonb,text),
 marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text),marriage.basics_json_before_courtship(uuid),marriage.basics_json(uuid)
 from public,anon,authenticated,service_role;
