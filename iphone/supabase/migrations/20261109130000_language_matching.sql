alter table marriage.partner_criteria drop constraint partner_criteria_criterion_check;
alter table marriage.partner_criteria add constraint partner_criteria_criterion_check check (criterion in('height','weight','tribalBackground','nationality','maritalStatus','children','smoking','skinTone','dressStyle','dressFlexibility','education','profession','sharedLanguage'));
alter function marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text) rename to normalize_marriage_extras_before_language_matching;
create function marriage.normalize_marriage_extras(basics jsonb,criteria jsonb,personality jsonb,version text) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; rule jsonb:=criteria->'sharedLanguage';
begin
 result:=marriage.normalize_marriage_extras_before_language_matching(basics,criteria-'sharedLanguage',personality,version);
 if criteria ? 'sharedLanguage' then
  if jsonb_typeof(rule) is distinct from 'object' or coalesce(rule->>'mode','') not in('any','prefer','require') then raise exception 'Invalid shared language preference' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(rule) k where k<>'mode') then raise exception 'Invalid language preference field' using errcode='22023'; end if;
  if rule->>'mode'<>'any' and coalesce(jsonb_array_length(basics->'spokenLanguages'),0)=0 then raise exception 'أضف لغاتك أولًا.' using errcode='22023'; end if;
  result:=jsonb_set(result,'{partnerCriteria}',(result->'partnerCriteria')||jsonb_build_object('sharedLanguage',rule));
 end if;
 return result;
end $$;
alter function marriage.criterion_fit(uuid,uuid,text,jsonb) rename to criterion_fit_before_language_matching;
create function marriage.criterion_fit(member uuid,peer uuid,kind text,rule jsonb) returns boolean language plpgsql stable set search_path='' as $$
declare own jsonb; other jsonb;
begin
 if kind<>'sharedLanguage' then return marriage.criterion_fit_before_language_matching(member,peer,kind,rule);end if;
 if rule->>'mode'='any' then return null;end if;
 own:=marriage.basics_json(member)->'spokenLanguages'; other:=marriage.basics_json(peer)->'spokenLanguages';
 if coalesce(jsonb_array_length(own),0)=0 or coalesce(jsonb_array_length(other),0)=0 then return null;end if;
 return exists(select 1 from jsonb_array_elements_text(own) language where other ? language);
end $$;
do $patch$ declare definition text; anchor text:=$a$and (coalesce(options->>'search','')=''$a$; begin
 definition:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 if strpos(definition,anchor)=0 then raise exception 'Browse anchor changed';end if;
 definition:=replace(definition,anchor,$a$and (coalesce(options->>'language','')='' or (b.language_details->'spokenLanguages') ? (options->>'language'))
 and (coalesce(options->>'search','')=''$a$);
 execute definition;
end $patch$;
revoke all on function marriage.normalize_marriage_extras_before_language_matching(jsonb,jsonb,jsonb,text),marriage.normalize_marriage_extras(jsonb,jsonb,jsonb,text),marriage.criterion_fit_before_language_matching(uuid,uuid,text,jsonb),marriage.criterion_fit(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
