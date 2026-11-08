-- Canonical city filters for Nisfayn only. No member records are rewritten.
-- This private, pure helper mirrors profileOptions.ts's Arabic keys and city aliases.
create or replace function marriage.city_filter_key(value text)
returns text language sql immutable parallel safe
set search_path = ''
as $city$
 select case key
  when 'riyadh' then 'الرياض'
  when 'jeddah' then 'جده' when 'jedda' then 'جده'
  when 'dammam' then 'الدمام'
  when 'khobar' then 'الخبر' when 'al khobar' then 'الخبر'
  when 'makkah' then 'مكه المكرمه' when 'mecca' then 'مكه المكرمه' when 'مكه' then 'مكه المكرمه'
  when 'madinah' then 'المدينه المنوره' when 'medina' then 'المدينه المنوره' when 'المدينه' then 'المدينه المنوره'
  when 'taif' then 'الطائف' when 'abha' then 'ابها' when 'tabuk' then 'تبوك'
  when 'hail' then 'حائل' when 'jazan' then 'جازان' when 'جيزان' then 'جازان'
  when 'najran' then 'نجران' when 'jubail' then 'الجبيل'
  when 'yanbu' then 'ينبع' when 'ينبع البحر' then 'ينبع'
  when 'محايل' then 'محايل عسير' when 'ابو ظبي' then 'ابوظبي' when 'الكويت' then 'مدينه الكويت'
  else key end
 from (select regexp_replace(translate(
  regexp_replace(lower(btrim(coalesce(value,''))), U&'[\064B-\065F\0670\0640]', '', 'g'),
  'أإآىة','ااايه'), '\s+', ' ', 'g') as key) normalized
$city$;
revoke all on function marriage.city_filter_key(text) from public, anon, authenticated;

-- Replace only the reviewed predicates, retaining current authorization, eligibility,
-- exclusivity, paid-membership checks, weekly ranking, and pagination verbatim.
do $migration$
declare
 definition text := pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 old_include text := $predicate$c.label ilike '%'||left(options->>'city',80)||'%'$predicate$;
 new_include text := $predicate$marriage.city_filter_key(c.label)=marriage.city_filter_key(left(options->>'city',80))$predicate$;
 old_exclude text := $predicate$not coalesce(options->'excludeCities','[]'::jsonb)?c.label$predicate$;
 new_exclude text := $predicate$not exists(select 1 from jsonb_array_elements_text(coalesce(options->'excludeCities','[]'::jsonb)) excluded_city(value) where marriage.city_filter_key(excluded_city.value)=marriage.city_filter_key(c.label))$predicate$;
begin
 if strpos(definition,old_include)=0 or strpos(definition,old_exclude)=0 then
  raise exception 'City filter migration stopped: the reviewed browse predicates have changed.';
 end if;
 definition := replace(replace(definition,old_include,new_include),old_exclude,new_exclude);
 execute definition;
end
$migration$;
