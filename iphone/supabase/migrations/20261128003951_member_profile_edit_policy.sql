-- The first application establishes identity. The monthly allowance starts with
-- the first subsequent change to matching answers, independently of public review.
alter table marriage.members add column last_compatibility_edit_at timestamptz;

alter function marriage.member_state(uuid) rename to member_state_before_edit_policy;
create function marriage.member_state(target uuid) returns jsonb
language sql stable set search_path='' as $$
  select case when target=auth.uid() then jsonb_set(s,'{user}',(s->'user') ||
    jsonb_build_object('nextCompatibilityEditAt',(
      select last_compatibility_edit_at + interval '30 days' from marriage.members
      where id=target and last_compatibility_edit_at + interval '30 days'>now()
    ))) else s end
  from (select marriage.member_state_before_edit_policy(target) s) account
$$;
revoke all on function marriage.member_state(uuid),marriage.member_state_before_edit_policy(uuid)
  from public,anon,authenticated,service_role;

create function marriage.compatibility_edit_values(profile jsonb, assessment boolean, sensitive boolean)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('minAge',profile->'preferredMinAge','maxAge',profile->'preferredMaxAge')) ||
    case when assessment then
      marriage.signup_assessment_snapshot(case when sensitive then profile
        else profile #- '{partnerCriteria,skinTone}' #- '{partnerCriteria,tribalBackground}' end) ||
      jsonb_build_object('scenarios',coalesce(profile#>'{beena,answers}','{}'::jsonb))
    else '{}'::jsonb end
$$;
revoke all on function marriage.compatibility_edit_values(jsonb,boolean,boolean) from public,anon,authenticated,service_role;

-- This private writer serves the already authenticated, row-locked application RPC.
alter function marriage.apply_profile_before_integrity(jsonb) rename to apply_profile_before_edit_policy;
create function marriage.apply_profile_before_integrity(payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  me uuid:=marriage.require_member();
  original jsonb;
  updated jsonb;
  old_values jsonb;
  new_values jsonb;
  result jsonb;
  names marriage.member_private_names;
  receipt jsonb;
  assessment boolean;
  sensitive boolean;
  last_edit timestamptz;
begin
  select last_compatibility_edit_at into strict last_edit from marriage.members where id=me for update;
  original:=marriage.profile_json(me);
  if original is null then
    return marriage.apply_profile_before_edit_policy(payload);
  end if;
  original:=original || jsonb_build_object('beena',marriage.beena_json(me));
  select * into names from marriage.member_private_names where member_id=me;
  if (payload ? 'gender' and payload->>'gender' is distinct from original->>'gender')
    or (original ? 'birthDate' and payload ? 'birthDate' and payload->>'birthDate' is distinct from original->>'birthDate')
    or (names.member_id is not null and (
      (payload ? 'firstName' and btrim(payload->>'firstName') is distinct from names.first_name)
      or (payload ? 'lastName' and btrim(payload->>'lastName') is distinct from names.last_name))) then
    raise exception 'لتصحيح الاسم الرسمي أو الجنس أو تاريخ الميلاد، تواصل مع الدعم.' using errcode='22023';
  end if;
  if original->>'birthDate' is null and
    ((payload ? 'age' and payload->>'age' is distinct from original->>'age')
     or (payload ? 'birthDate' and marriage.birthday_age((payload->>'birthDate')::date)::text is distinct from original->>'age')) then
    raise exception 'تاريخ الميلاد يجب أن يطابق عمرك المسجّل. لتصحيح العمر، تواصل مع الدعم.' using errcode='22023';
  end if;

  result:=marriage.apply_profile_before_edit_policy(payload);
  updated:=marriage.profile_json(me) || jsonb_build_object('beena',marriage.beena_json(me));
  receipt:=marriage.signup_consents_json(me);
  -- Compare only the data still permitted after withdrawal, on both sides.
  -- Age preferences remain independently editable and cannot ride on a withdrawal.
  assessment:=(receipt->'assessment') is distinct from 'false'::jsonb;
  sensitive:=(receipt->'sensitiveProfile') is distinct from 'false'::jsonb;
  old_values:=marriage.compatibility_edit_values(original,assessment,sensitive);
  new_values:=marriage.compatibility_edit_values(updated,assessment,sensitive);
  -- Erasing all optional Beena answers is a privacy action. Re-entering answers
  -- still uses the existing allowance, and unrelated changes are still compared.
  if new_values->'scenarios'='{}'::jsonb then
    old_values:=old_values-'scenarios';
    new_values:=new_values-'scenarios';
  end if;
  -- Set-valued answers have no meaningful order.
  if not (old_values @> new_values and new_values @> old_values) then
    if last_edit + interval '30 days'>now() then
      raise exception 'تقدر تحدّث إجابات التوافق مرة كل ٣٠ يومًا. موعدك القادم % بتوقيت السعودية.',
        to_char((last_edit+interval '30 days') at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI') using errcode='P0001';
    end if;
    update marriage.members set last_compatibility_edit_at=now() where id=me;
    result:=jsonb_set(result,'{user,nextCompatibilityEditAt}',to_jsonb(now()+interval '30 days'));
  end if;
  return result;
end $$;
revoke all on function marriage.apply_profile_before_integrity(jsonb),marriage.apply_profile_before_edit_policy(jsonb)
  from public,anon,authenticated,service_role;
