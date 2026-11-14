-- Preserve existing answers while distinguishing the product used most often.
alter table marriage.member_basics drop constraint member_basics_smoking_check;
alter table marriage.member_basics add constraint member_basics_smoking_check
 check(smoking in('never','cigarettes','vape','shisha','sometimes','yes'));

do $smoking$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('marriage.normalize_marriage_extras_before_appearance(jsonb,jsonb,jsonb,text)'::regprocedure);
 needle:=$old$(k='smoking' and (v#>>'{}') not in('never','sometimes','yes'))$old$;
 if strpos(definition,needle)=0 then raise exception 'Expected smoking validation not found';end if;
 execute replace(definition,needle,$new$(k='smoking' and (v#>>'{}') not in('never','cigarettes','vape','shisha','sometimes','yes'))$new$);

 definition:=pg_get_functiondef('marriage.interview_profile_values_valid(jsonb)'::regprocedure);
 needle:=$old$"fieldId":"marriageBasics.smoking","kind":"enum","options":["never","sometimes","yes"]$old$;
 if strpos(definition,needle)=0 then raise exception 'Expected interview smoking catalog not found';end if;
 execute replace(definition,needle,$new$"fieldId":"marriageBasics.smoking","kind":"enum","options":["never","cigarettes","vape","shisha","sometimes","yes"]$new$);
end $smoking$;

-- Keep an explicit publication choice in a private draft without granting it.
-- Actual publication still requires the normal submitted consent record.
do $draft$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
 needle:=$old$k not in('version','sensitiveProfile','assessment','interview')$old$;
 if strpos(definition,needle)=0 then raise exception 'Expected draft permission allowlist not found';end if;
 definition:=replace(definition,needle,$new$k not in('version','sensitiveProfile','sensitivePublication','assessment','interview')$new$);
 needle:=$old$or jsonb_typeof(permissions->'sensitiveProfile') is distinct from 'boolean'$old$;
 if strpos(definition,needle)=0 then raise exception 'Expected draft permission validation not found';end if;
 definition:=replace(definition,needle,$new$or (permissions ? 'sensitivePublication' and jsonb_typeof(permissions->'sensitivePublication') is distinct from 'boolean')
  or jsonb_typeof(permissions->'sensitiveProfile') is distinct from 'boolean'$new$);
 execute definition;
end $draft$;
