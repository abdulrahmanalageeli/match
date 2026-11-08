-- Manual fixture for the Nisfayn private paired-test room only (wupkifqbwhhebwrgvwai).
-- Requested by the owner on 2026-11-08. Fictional QA answers, not personal claims.
-- Never run this as a signup migration or against ordinary member accounts.
-- Assessment-processing permission below is for these synthetic test answers only;
-- no terms, age declaration, sensitive publication, photos or verification grants are added.
do $seed$
declare
 fixture jsonb := $fixture${"abdulrahman":{"assessmentVersion":"marriage-v2","priorityCategories":["values","plans"],"surveyAnswers":{"children_plan":"A","partner_children_plan":"A","residence_plan":"C","partner_residence_plan":"C","wife_work":"A","partner_wife_work":"A","marriage_timeline":"A","partner_marriage_timeline":"A","family_boundaries":"A","partner_family_boundaries":"A","shared_budget":"A","partner_shared_budget":"A","household_roles":"B","partner_household_roles":"B","weekly_planning":"B","partner_weekly_planning":"B","social_rhythm":"B","partner_social_rhythm":"B","conversation_initiative_preference":"C","partner_conversation_initiative_preference":"A","match_disagreement_style":"A","partner_match_disagreement_style":"B","repair_after_conflict":"B","partner_repair_after_conflict":"B","conversation_depth":"A","partner_conversation_depth":"B","closeness_pace":"B","partner_closeness_pace":"A","curiosity_style":"A","partner_curiosity_style":"B","early_openness":"B","partner_early_openness":"B"},"personalityVersion":"personality-v1","personalityAnswers":{"social_energy":"C","initiative":"E","depth":"E","openness":"D","closeness":"D","reassurance":"C","support":"C","planning":"E","novelty":"D","conflict_pace":"D","directness":"E","quiet_comfort":"D"},"beena":{"version":"beena-v1","answers":{"family_boundaries":{"self":"A","partner":["A","B"],"importance":2},"finances":{"self":"A","partner":["A","D"],"importance":2},"conflict":{"self":"B","partner":["B","D"],"importance":2},"career":{"self":"C","partner":["A","C"],"importance":1},"household":{"self":"B","partner":["B"],"importance":1},"support":{"self":"B","partner":["B","C"],"importance":1}}}},"reham":{"assessmentVersion":"marriage-v2","priorityCategories":["values","communication"],"surveyAnswers":{"children_plan":"A","partner_children_plan":"A","residence_plan":"C","partner_residence_plan":"C","wife_work":"A","partner_wife_work":"A","marriage_timeline":"B","partner_marriage_timeline":"A","family_boundaries":"A","partner_family_boundaries":"A","shared_budget":"B","partner_shared_budget":"B","household_roles":"B","partner_household_roles":"B","weekly_planning":"B","partner_weekly_planning":"B","social_rhythm":"A","partner_social_rhythm":"B","conversation_initiative_preference":"A","partner_conversation_initiative_preference":"C","match_disagreement_style":"B","partner_match_disagreement_style":"B","repair_after_conflict":"B","partner_repair_after_conflict":"B","conversation_depth":"B","partner_conversation_depth":"B","closeness_pace":"A","partner_closeness_pace":"B","curiosity_style":"B","partner_curiosity_style":"A","early_openness":"B","partner_early_openness":"B"},"personalityVersion":"personality-v1","personalityAnswers":{"social_energy":"B","initiative":"C","depth":"D","openness":"D","closeness":"E","reassurance":"E","support":"D","planning":"C","novelty":"C","conflict_pace":"B","directness":"D","quiet_comfort":"E"},"beena":{"version":"beena-v1","answers":{"family_boundaries":{"self":"B","partner":["A"],"importance":2},"finances":{"self":"D","partner":["A"],"importance":1},"conflict":{"self":"D","partner":["A","D"],"importance":2},"career":{"self":"A","partner":["A","C"],"importance":2},"household":{"self":"B","partner":["B"],"importance":1},"support":{"self":"A","partner":["A","D"],"importance":2}}}}}$fixture$::jsonb;
 original jsonb; patched jsonb; current_profile jsonb; person text; scenario record;
 assessment_keys text[] := array['assessmentVersion','surveyAnswers','priorityCategories','personalityVersion','personalityAnswers'];
begin
 select data into original from nisfayn_test.room where id=true for update;
 if not found or jsonb_typeof(original->'profiles') is distinct from 'object' then
  raise exception 'Missing private paired-test room'; end if;
 if (select count(*) from marriage.admin_test_members where actor in('abdulrahman','reham'))<>2 then
  raise exception 'Expected exactly the two existing paired-test actors'; end if;
 patched:=original;
 foreach person in array array['abdulrahman','reham'] loop
  current_profile:=coalesce(original#>array['profiles',person],'{}'::jsonb);
  if current_profile='{}'::jsonb then
   if person<>'abdulrahman' then raise exception 'Expected existing Reham profile'; end if;
   -- Same fictional baseline already used by the paired-test client for this missing profile.
   current_profile:='{"displayName":"عبدالرحمن","gender":"man","age":29,"city":"الرياض","profession":"تطوير نصفين","bio":"أطوّر تجربة نصفين وأختبر التعارف والمحادثات مع رهام. المعلومات والإجابات الأولية أمثلة قابلة للتعديل.","contact":"abdulrahman@example.invalid","preferredMinAge":22,"preferredMaxAge":38,"familyPreference":"تعارف جاد بخطوات واضحة نحو مشاركة الأهل","interestIds":["reading","walking","travel"],"hardRequirements":[]}'::jsonb;
  end if;
  patched:=jsonb_set(patched,array['profiles',person],current_profile||((fixture->person)-'beena'),true);
  perform marriage.normalize_beena(fixture#>array[person,'beena']);
  for scenario in select key,value from jsonb_each(fixture#>array[person,'beena','answers']) loop
   insert into nisfayn_test.beena_answers(actor,scenario_id,self_code,partner_codes,importance)
   values(person,scenario.key,scenario.value->>'self',array(select jsonb_array_elements_text(scenario.value->'partner')),(scenario.value->>'importance')::smallint)
   on conflict(actor,scenario_id) do update set self_code=excluded.self_code,partner_codes=excluded.partner_codes,importance=excluded.importance;
  end loop;
  if nisfayn_test.signup_consents_json(person)->'assessment' is distinct from 'true'::jsonb then
   insert into nisfayn_test.signup_consent_events(actor,version,purpose,granted)
   values(person,'2026-11-07-privacy','assessment_processing',true);
  end if;
 end loop;
 update nisfayn_test.room set data=patched where id=true;
 select data into patched from nisfayn_test.room where id=true;
 if (patched-'profiles') is distinct from (original-'profiles') then
  raise exception 'Refusing to alter chat, match or other room state'; end if;
 foreach person in array array['abdulrahman','reham'] loop
  if original#>array['profiles',person] is not null and
   ((patched#>array['profiles',person])-assessment_keys) is distinct from ((original#>array['profiles',person])-assessment_keys) then
   raise exception 'Refusing to alter existing non-assessment profile fields'; end if;
 end loop;
end $seed$;
select jsonb_build_object(
 'profiles',(select jsonb_agg(jsonb_build_object('actor',p.key,'version',p.value->>'assessmentVersion',
 'preferenceAnswers',(select count(*) from jsonb_object_keys(p.value->'surveyAnswers')),
 'personalityAnswers',(select count(*) from jsonb_object_keys(p.value->'personalityAnswers'))))
 from nisfayn_test.room r cross join lateral jsonb_each(r.data->'profiles') p where r.id=true),
 'beena',marriage.compare_beena(nisfayn_test.beena_json('abdulrahman'),nisfayn_test.beena_json('reham')),
 'matched',(select data->'matched' from nisfayn_test.room where id=true),
 'messageCount',(select jsonb_array_length(data->'messages') from nisfayn_test.room where id=true)
) as fixture_result;
