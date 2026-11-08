-- Nisfayn: explicit structured partner criteria and discovery filters.
-- Existing profile text is preserved; only recognized self-reported facts participate.
create or replace function marriage.profile_choice_key(value text) returns text
language sql immutable parallel safe set search_path='' as $key$
 select regexp_replace(translate(regexp_replace(lower(btrim(coalesce(value,''))),
 U&'[\064B-\065F\0670\0640]','','g'),'أإآىة','ااايه'),'\s+',' ','g')
$key$;

create or replace function marriage.structured_profile_choices(kind text) returns text[]
language sql immutable parallel safe set search_path='' as $choices$
 select case kind
 when 'education' then ARRAY['دون الثانوية','الثانوية','دبلوم','بكالوريوس','دبلوم عالٍ','ماجستير','دكتوراه']
 when 'profession' then ARRAY['الطب والرعاية الصحية','الهندسة والعمارة','التقنية والبرمجة','التعليم والتدريب','البحث والعمل الأكاديمي','الإدارة والموارد البشرية','المال والمحاسبة','القانون والاستشارات','التجارة والمبيعات','التسويق والإعلام','التصميم والفنون','الترجمة واللغات','القطاع العسكري والأمني','الخدمات الحكومية','النقل والخدمات اللوجستية','السياحة والضيافة','الصناعة والحرف','الزراعة والبيئة','العمل الاجتماعي وغير الربحي','مجال مهني آخر','أعمال حرة وريادة أعمال','عمل مستقل','طالب / طالبة','متفرغ / متفرغة للمنزل','باحث / باحثة عن عمل','متقاعد / متقاعدة','لا أعمل حاليًا']
 else ARRAY[]::text[] end
$choices$;

create or replace function marriage.canonical_education(value text) returns text
language sql immutable parallel safe set search_path='' as $education$
 with cleaned as (select marriage.profile_choice_key(value) as key)
 select case when key ~ '(قيد|ادرس|طالب|لم اكمل|غير مكتمل|غيرمكتمل|in progress|student)'
 then btrim(coalesce(value,'')) else coalesce(
 (select choice from unnest(marriage.structured_profile_choices('education')) choice where marriage.profile_choice_key(choice)=key),
 (select canonical from (values
 (0,'دبلوم عال','دبلوم عالٍ'),
 (1,'دبلوم عالي','دبلوم عالٍ'),
 (2,'دكتوراه','دكتوراه'),
 (3,'ماجستير','ماجستير'),
 (4,'بكالوريوس','بكالوريوس'),
 (5,'دبلوم','دبلوم'),
 (6,'الثانويه','الثانوية'),
 (7,'ثانويه','الثانوية'),
 (8,'ثانوي','الثانوية'),
 (9,'دون الثانويه','دون الثانوية')
 ) prefixes(ordinal,prefix,canonical) where key=prefix or left(key,length(prefix)+1)=prefix||' ' order by ordinal limit 1),
 btrim(coalesce(value,''))) end from cleaned
$education$;

create or replace function marriage.canonical_profession(value text) returns text
language sql immutable parallel safe set search_path='' as $profession$
 select coalesce((select canonical from (values
 ('الطب والرعايه الصحيه','الطب والرعاية الصحية'),
 ('الهندسه والعماره','الهندسة والعمارة'),
 ('التقنيه والبرمجه','التقنية والبرمجة'),
 ('التعليم والتدريب','التعليم والتدريب'),
 ('البحث والعمل الاكاديمي','البحث والعمل الأكاديمي'),
 ('الاداره والموارد البشريه','الإدارة والموارد البشرية'),
 ('المال والمحاسبه','المال والمحاسبة'),
 ('القانون والاستشارات','القانون والاستشارات'),
 ('التجاره والمبيعات','التجارة والمبيعات'),
 ('التسويق والاعلام','التسويق والإعلام'),
 ('التصميم والفنون','التصميم والفنون'),
 ('الترجمه واللغات','الترجمة واللغات'),
 ('القطاع العسكري والامني','القطاع العسكري والأمني'),
 ('الخدمات الحكوميه','الخدمات الحكومية'),
 ('النقل والخدمات اللوجستيه','النقل والخدمات اللوجستية'),
 ('السياحه والضيافه','السياحة والضيافة'),
 ('الصناعه والحرف','الصناعة والحرف'),
 ('الزراعه والبيئه','الزراعة والبيئة'),
 ('العمل الاجتماعي وغير الربحي','العمل الاجتماعي وغير الربحي'),
 ('مجال مهني اخر','مجال مهني آخر'),
 ('اعمال حره ورياده اعمال','أعمال حرة وريادة أعمال'),
 ('عمل مستقل','عمل مستقل'),
 ('طالب / طالبه','طالب / طالبة'),
 ('متفرغ / متفرغه للمنزل','متفرغ / متفرغة للمنزل'),
 ('باحث / باحثه عن عمل','باحث / باحثة عن عمل'),
 ('متقاعد / متقاعده','متقاعد / متقاعدة'),
 ('لا اعمل حاليا','لا أعمل حاليًا'),
 ('طبيب','الطب والرعاية الصحية'),
 ('طبيبه','الطب والرعاية الصحية'),
 ('صيدلي','الطب والرعاية الصحية'),
 ('صيدلانيه','الطب والرعاية الصحية'),
 ('ممرض','الطب والرعاية الصحية'),
 ('ممرضه','الطب والرعاية الصحية'),
 ('اخصائي مختبر','الطب والرعاية الصحية'),
 ('اخصائيه مختبر','الطب والرعاية الصحية'),
 ('اخصائي علاج طبيعي','الطب والرعاية الصحية'),
 ('اخصائيه علاج طبيعي','الطب والرعاية الصحية'),
 ('اخصائي تغذيه','الطب والرعاية الصحية'),
 ('اخصائيه تغذيه','الطب والرعاية الصحية'),
 ('مهندس','الهندسة والعمارة'),
 ('مهندسه','الهندسة والعمارة'),
 ('مهندس مدني','الهندسة والعمارة'),
 ('مهندسه مدنيه','الهندسة والعمارة'),
 ('مهندس معماري','الهندسة والعمارة'),
 ('مهندسه معماريه','الهندسة والعمارة'),
 ('مبرمج','التقنية والبرمجة'),
 ('مبرمجه','التقنية والبرمجة'),
 ('مهندس برمجيات','التقنية والبرمجة'),
 ('مهندسه برمجيات','التقنية والبرمجة'),
 ('محلل بيانات','التقنية والبرمجة'),
 ('محلله بيانات','التقنية والبرمجة'),
 ('معلم','التعليم والتدريب'),
 ('معلمه','التعليم والتدريب'),
 ('مدرس','التعليم والتدريب'),
 ('مدرسه','التعليم والتدريب'),
 ('معلمه فنون','التعليم والتدريب'),
 ('معلم فنون','التعليم والتدريب'),
 ('باحث','البحث والعمل الأكاديمي'),
 ('باحثه','البحث والعمل الأكاديمي'),
 ('استاذ جامعي','البحث والعمل الأكاديمي'),
 ('استاذه جامعيه','البحث والعمل الأكاديمي'),
 ('مدير عمليات','الإدارة والموارد البشرية'),
 ('مديره عمليات','الإدارة والموارد البشرية'),
 ('مدير مشاريع','الإدارة والموارد البشرية'),
 ('مديره مشاريع','الإدارة والموارد البشرية'),
 ('اخصائي موارد بشريه','الإدارة والموارد البشرية'),
 ('اخصائيه موارد بشريه','الإدارة والموارد البشرية'),
 ('محاسب','المال والمحاسبة'),
 ('محاسبه','المال والمحاسبة'),
 ('محامي','القانون والاستشارات'),
 ('محاميه','القانون والاستشارات'),
 ('اخصائي تسويق','التسويق والإعلام'),
 ('اخصائيه تسويق','التسويق والإعلام'),
 ('كاتب محتوي','التسويق والإعلام'),
 ('كاتبه محتوي','التسويق والإعلام'),
 ('صحفي','التسويق والإعلام'),
 ('صحفيه','التسويق والإعلام'),
 ('مصمم','التصميم والفنون'),
 ('مصممه','التصميم والفنون'),
 ('مصمم منتجات','التصميم والفنون'),
 ('مصممه منتجات','التصميم والفنون'),
 ('مصمم داخلي','التصميم والفنون'),
 ('مصممه داخليه','التصميم والفنون'),
 ('مترجم','الترجمة واللغات'),
 ('مترجمه','الترجمة واللغات'),
 ('صاحب مقهي','أعمال حرة وريادة أعمال'),
 ('صاحبه مقهي','أعمال حرة وريادة أعمال'),
 ('مؤسس متجر الكتروني','أعمال حرة وريادة أعمال'),
 ('مؤسسه متجر الكتروني','أعمال حرة وريادة أعمال'),
 ('مستقل','عمل مستقل'),
 ('مستقله','عمل مستقل'),
 ('مصور مستقل','عمل مستقل'),
 ('طالب','طالب / طالبة'),
 ('طالبه','طالب / طالبة'),
 ('ربه منزل','متفرغ / متفرغة للمنزل'),
 ('متفرغه للمنزل','متفرغ / متفرغة للمنزل'),
 ('متفرغ للمنزل','متفرغ / متفرغة للمنزل'),
 ('باحث عن عمل','باحث / باحثة عن عمل'),
 ('باحثه عن عمل','باحث / باحثة عن عمل'),
 ('متقاعد','متقاعد / متقاعدة'),
 ('متقاعده','متقاعد / متقاعدة')
 ) aliases(alias,canonical) where alias=marriage.profile_choice_key(value)),btrim(coalesce(value,'')))
$profession$;

create or replace function marriage.structured_profile_value(kind text,value text) returns text
language sql immutable parallel safe set search_path='' as $value$
 select case when canonical=any(marriage.structured_profile_choices(kind)) then canonical else null end
 from (select case kind when 'education' then marriage.canonical_education(value)
 when 'profession' then marriage.canonical_profession(value) else null end as canonical) fact
$value$;

create or replace function marriage.normalize_structured_criteria(criteria jsonb) returns jsonb
language plpgsql immutable set search_path='' as $criteria$
declare kind text; rule jsonb; result jsonb:='{}';
begin
 if jsonb_typeof(criteria) is distinct from 'object' then
  raise exception 'تحقق من تنسيق تفضيلات الدراسة والعمل.' using errcode='22023';
 end if;
 foreach kind in array array['education','profession'] loop
  if not(criteria?kind) then continue; end if;
  rule:=criteria->kind;
  if jsonb_typeof(rule) is distinct from 'object' or coalesce(rule->>'mode','') not in('any','prefer','require') then
   raise exception 'اختر أهمية تفضيلات الدراسة والعمل.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(rule) field where field not in('mode','values')) then
   raise exception 'حقل غير معروف في تفضيلات الدراسة والعمل.' using errcode='22023';
  end if;
  if rule->>'mode'='any' then rule:='{"mode":"any"}'; else
   if jsonb_typeof(rule->'values') is distinct from 'array' then
    raise exception 'اختر إجابة واحدة على الأقل للدراسة والعمل.' using errcode='22023';
   end if;
   if jsonb_array_length(rule->'values') not between 1 and cardinality(marriage.structured_profile_choices(kind))
    or exists(select 1 from jsonb_array_elements(rule->'values') value where jsonb_typeof(value)<>'string'
     or not((value#>>'{}')=any(marriage.structured_profile_choices(kind))))
    or exists(select 1 from jsonb_array_elements(rule->'values') value group by value having count(*)>1) then
    raise exception 'اختر الدراسة والعمل من القوائم المتاحة دون تكرار.' using errcode='22023';
   end if;
  end if;
  result:=result||jsonb_build_object(kind,rule);
 end loop;
 return result;
end $criteria$;

revoke all on function marriage.profile_choice_key(text),marriage.structured_profile_choices(text),
 marriage.canonical_education(text),marriage.canonical_profession(text),marriage.structured_profile_value(text,text),
 marriage.normalize_structured_criteria(jsonb) from public,anon,authenticated,service_role;

alter table marriage.partner_criteria drop constraint partner_criteria_criterion_check;
alter table marriage.partner_criteria add constraint partner_criteria_criterion_check check
 (criterion in('height','weight','tribalBackground','nationality','maritalStatus','children','smoking','skinTone','dressStyle','dressFlexibility','education','profession'));

-- Guard each patch against unexpected schema drift; preserve existing function ACLs.
do $patch$
declare definition text; anchor text; replacement text; filter_key text;
begin
 definition:=pg_get_functiondef('marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text)'::regprocedure);
 anchor:=$old$basics-array['marriageTimeline','meetingPreference'],criteria,personality,version$old$;
 replacement:=$new$basics-array['marriageTimeline','meetingPreference'],criteria-array['education','profession'],personality,version$new$;
 if strpos(definition,anchor)=0 then raise exception 'Structured criteria normalization anchor changed.';end if;
 definition:=replace(definition,anchor,replacement);
 anchor:=$old$return jsonb_set(result,'{marriageBasics}',(result->'marriageBasics')||extra);$old$;
 replacement:=$new$result:=jsonb_set(result,'{partnerCriteria}',(result->'partnerCriteria')||marriage.normalize_structured_criteria(criteria));
 return jsonb_set(result,'{marriageBasics}',(result->'marriageBasics')||extra);$new$;
 if strpos(definition,anchor)=0 then raise exception 'Structured criteria return anchor changed.';end if;
 execute replace(definition,anchor,replacement);

 definition:=pg_get_functiondef('marriage.criterion_fit(uuid,uuid,text,jsonb)'::regprocedure);
 anchor:=$old$if kind<>'nationality' then$old$;
 replacement:=$new$if kind in('education','profession') then
  if rule->>'mode'='any' then return null;end if;
  select marriage.structured_profile_value(kind,case when kind='education' then details.education else profile.profession end)
   into nationality from marriage.profiles profile left join marriage.profile_details details on details.member_id=profile.member_id
   where profile.member_id=peer;
  if nationality is null then return null;end if;
  return (rule->'values')?nationality;
 end if;
 if kind<>'nationality' then$new$;
 if strpos(definition,anchor)=0 then raise exception 'Structured criterion fit anchor changed.';end if;
 execute replace(definition,anchor,replacement);

 definition:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 anchor:=$old$skip integer:=coalesce((options->>'offset')::integer,0); begin$old$;
 replacement:=$new$skip integer:=coalesce((options->>'offset')::integer,0); filter_key text; filter_value jsonb; minimum integer; maximum integer; begin
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
 end if;$new$;
 if strpos(definition,anchor)=0 then raise exception 'Structured browse validation anchor changed.';end if;
 definition:=replace(definition,anchor,replacement);
 anchor:=$old$cross join lateral marriage.pair_fit(me,p.member_id) f$old$;
 replacement:=$new$left join marriage.profile_details details on details.member_id=p.member_id
  cross join lateral marriage.pair_fit(me,p.member_id) f$new$;
 if strpos(definition,anchor)=0 then raise exception 'Structured browse join anchor changed.';end if;
 definition:=replace(definition,anchor,replacement);
 anchor:=$old$and (coalesce(options->>'search','')=''$old$;
 replacement:=$new$and (coalesce(options->>'education','')='' or marriage.structured_profile_value('education',details.education)=options->>'education')
   and (coalesce(options->>'profession','')='' or marriage.structured_profile_value('profession',p.profession)=options->>'profession')
   and (options->>'minHeight' is null or b.height_cm>=(options->>'minHeight')::integer)
   and (options->>'maxHeight' is null or b.height_cm<=(options->>'maxHeight')::integer)
   and (options->>'minWeight' is null or b.weight_kg>=(options->>'minWeight')::integer)
   and (options->>'maxWeight' is null or b.weight_kg<=(options->>'maxWeight')::integer)
   and (coalesce(options->>'children','')='' or (options->>'children'='none' and b.children_count=0) or (options->>'children'='has' and b.children_count>0))
   and (coalesce(options->>'search','')=''$new$;
 if strpos(definition,anchor)=0 then raise exception 'Structured browse filter anchor changed.';end if;
 execute replace(definition,anchor,replacement);

 foreach filter_key in array array['compatible_before_basics','match_reasons'] loop
  definition:=pg_get_functiondef(('marriage.'||filter_key||'(uuid,uuid)')::regprocedure);
  anchor:='p.city_id=q.city_id';
  replacement:=$new$exists(select 1 from marriage.cities city_a cross join marriage.cities city_b
    where city_a.id=p.city_id and city_b.id=q.city_id
     and marriage.city_filter_key(city_a.label) not in('مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه')
     and marriage.city_filter_key(city_a.label)=marriage.city_filter_key(city_b.label))$new$;
  if strpos(definition,anchor)=0 then raise exception 'Canonical city eligibility anchor changed: %.',filter_key;end if;
  execute replace(definition,anchor,replacement);
 end loop;
end $patch$;
