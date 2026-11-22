-- Private identity is never a column of a searchable profile or part of an approved card.
create table marriage.member_private_names (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) between 1 and 60),
  last_name text not null check (length(btrim(last_name)) between 1 and 60)
);
alter table marriage.member_private_names enable row level security;
revoke all on marriage.member_private_names from public,anon,authenticated,service_role;

alter function marriage.member_state(uuid) rename to member_state_before_private_names;
create function marriage.member_state(target uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_private_names(target); names jsonb;
begin
  if target=auth.uid() and jsonb_typeof(result->'profile')='object' then
    select jsonb_build_object('firstName',first_name,'lastName',last_name)
      into names from marriage.member_private_names where member_id=target;
    if names is not null then
      result:=jsonb_set(result,'{profile}',(result->'profile')||names);
    end if;
  end if;
  return result;
end $$;
revoke all on function marriage.member_state(uuid),marriage.member_state_before_private_names(uuid)
  from public,anon,authenticated,service_role;

-- Keep the existing integrity fingerprint over the entire submitted application, but pass
-- only the public nickname to the existing profile, scoring, review and publication writers.
alter function marriage.apply_profile_before_integrity(jsonb) rename to apply_profile_without_private_names;
create function marriage.apply_profile_before_integrity(payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare me uuid:=marriage.require_member(); given text:=btrim(payload->>'firstName');
  family text:=btrim(payload->>'lastName'); registering boolean;
begin
  registering:=not exists(select 1 from marriage.profiles where member_id=me);
  perform marriage.apply_profile_without_private_names(payload-array['firstName','lastName']);
  if registering or payload ?| array['firstName','lastName'] then
    if jsonb_typeof(payload->'firstName') is distinct from 'string'
      or jsonb_typeof(payload->'lastName') is distinct from 'string'
      or length(given) not between 1 and 60 or given !~ '[^[:space:]]'
      or length(family) not between 1 and 60 or family !~ '[^[:space:]]' then
      raise exception 'أدخل اسمك الأول واسم العائلة.' using errcode='22023';
    end if;
    insert into marriage.member_private_names values(me,given,family)
      on conflict(member_id) do update set first_name=excluded.first_name,last_name=excluded.last_name;
  end if;
  return marriage.member_state(me);
end $$;
revoke all on function marriage.apply_profile_before_integrity(jsonb),marriage.apply_profile_without_private_names(jsonb)
  from public,anon,authenticated,service_role;

-- Extend the same public plan storage and projection used for housing and wedding plans.
do $$declare routine regprocedure; definition text; updated text;
begin
  definition:=pg_get_functiondef('marriage.public_plans_valid(jsonb)'::regprocedure);
  updated:=replace(definition,'else return false;', $case$
   when 'mahrRange' then if (v#>>'{}') not in('under_30000','from_30000','from_50000','from_70000','from_100000') then return false; end if;
   else return false;$case$);
  if definition=updated then raise exception 'Public plan validation changed'; end if;
  execute updated;
  foreach routine in array array['marriage.normalize_marriage_extras_v1(jsonb,jsonb,jsonb,text)'::regprocedure,
    'marriage.apply_profile_before_onboarding_consent(jsonb)'::regprocedure] loop
    definition:=pg_get_functiondef(routine);
    updated:=replace(definition,'''housingPlan'',''expenseSharing''','''housingPlan'',''expenseSharing'',''mahrRange''');
    if definition=updated then raise exception 'Public marriage plan keys missing in %',routine; end if;
    execute updated;
  end loop;
  definition:=pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
  updated:=replace(definition,'''displayName'',''age''','''firstName'',''lastName'',''displayName'',''age''');
  if definition=updated then raise exception 'Owner draft allowlist changed'; end if;
  execute updated;
end $$;
alter function marriage.validate_marriage_eligibility(text,jsonb) rename to validate_marriage_eligibility_before_mahr;
create function marriage.validate_marriage_eligibility(gender text,basics jsonb) returns void
language plpgsql set search_path='' as $$
begin
  perform marriage.validate_marriage_eligibility_before_mahr(gender,basics);
  if basics?'mahrRange' and gender is distinct from 'woman' then
    raise exception 'نطاق المهر متاح للنساء فقط.' using errcode='22023';
  end if;
end $$;
revoke all on function marriage.public_plans_valid(jsonb),
  marriage.validate_marriage_eligibility(text,jsonb),marriage.validate_marriage_eligibility_before_mahr(text,jsonb)
  from public,anon,authenticated,service_role;
