-- Read-only assertions for the canonical discovery city migration.
with samples(value,peer,expected) as (values
 ('Riyadh','الرياض',true), (' جده ','جدة',true), ('مكة','مكة المكرمة',true),
 ('medina','المدينة المنورة',true), ('ابها','أبها',true), ('ينبع البحر','ينبع',true),
 ('جدة الجديدة','جدة',false), ('رياض','الرياض',false), ('أبها','الباحة',false),
 ('مدينة أخرى داخل السعودية','مدينة أخرى خارج السعودية',false)
)
select count(*) as cases,
 bool_and((marriage.city_filter_key(value)=marriage.city_filter_key(peer))=expected) as passed
from samples;

select
 strpos(pg_get_functiondef('marriage.browse(jsonb)'::regprocedure),
 'marriage.city_filter_key(c.label)=marriage.city_filter_key(left(options->>''city'',80))')>0 as include_is_canonical,
 strpos(pg_get_functiondef('marriage.browse(jsonb)'::regprocedure),
 'marriage.city_filter_key(excluded_city.value)=marriage.city_filter_key(c.label)')>0 as exclusion_is_canonical,
 not has_function_privilege('anon','marriage.city_filter_key(text)','execute') as helper_private_anon,
 not has_function_privilege('authenticated','marriage.city_filter_key(text)','execute') as helper_private_member;
