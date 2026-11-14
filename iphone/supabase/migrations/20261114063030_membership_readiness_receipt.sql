-- Private account receipt. Neither discovery nor compatibility reads this table.
create table marriage.membership_readiness_receipts (
  member_id uuid primary key references marriage.members(id) on delete cascade,
  response jsonb not null,
  accepted_at timestamptz not null default now()
);
alter table marriage.membership_readiness_receipts enable row level security;
revoke all on marriage.membership_readiness_receipts from public, anon, authenticated, service_role;

create function marriage.valid_membership_readiness(response jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare notes jsonb;
begin
  if jsonb_typeof(response) is distinct from 'object' or octet_length(response::text)>512 then return false; end if;
  notes := coalesce(response->'clarifications', '{}'::jsonb);
  if jsonb_typeof(notes) is distinct from 'object' then return false; end if;
  return not exists(select 1 from jsonb_object_keys(response) k where k not in ('family','nextStep','clarifications','agreement'))
    and (not(response?'family') or coalesce(response->>'family','') in ('early','discuss','later'))
    and (not(response?'nextStep') or coalesce(response->>'nextStep','') in ('soon','after_agreement','not_yet'))
    and (not(response?'agreement') or coalesce(response->>'agreement','')='wudayn-membership-v1')
    and not exists(select 1 from jsonb_each(notes) n where n.key not in ('family','nextStep') or n.value not in ('"context"'::jsonb,'"review"'::jsonb));
end $$;
revoke all on function marriage.valid_membership_readiness(jsonb) from public, anon, authenticated, service_role;

-- Existing deployments can still submit and edit profiles without this optional
-- API field. The new signup UI requires it before submitting.
alter function marriage.apply_profile(jsonb) rename to apply_profile_before_membership_readiness;
create function marriage.apply_profile(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  me uuid := marriage.require_member();
  receipt jsonb := payload->'_membershipReadiness';
  notes jsonb;
  result jsonb;
begin
  if receipt is not null then
    notes := coalesce(receipt->'clarifications', '{}'::jsonb);
    if not marriage.valid_membership_readiness(receipt)
      or not(receipt ?& array['family','nextStep','agreement'])
      or receipt->>'agreement' is distinct from 'wudayn-membership-v1'
      or (receipt->>'family'='later' and payload->>'familyPreference'='من البداية' and not(notes?'family'))
      or (receipt->>'nextStep'='not_yet' and payload#>>'{surveyAnswers,marriage_timeline}'='A' and not(notes?'nextStep')) then
      raise exception 'راجع مواقف الجاهزية واتفاق العضوية.' using errcode='22023';
    end if;
    -- Keep only clarifications tied to an actual difference in this application.
    if not (receipt->>'family'='later' and coalesce(payload->>'familyPreference','')='من البداية') then notes := notes-'family'; end if;
    if not (receipt->>'nextStep'='not_yet' and coalesce(payload#>>'{surveyAnswers,marriage_timeline}','')='A') then notes := notes-'nextStep'; end if;
    receipt := jsonb_set(receipt, '{clarifications}', notes);
  end if;
  result := marriage.apply_profile_before_membership_readiness(payload-'_membershipReadiness');
  if receipt is not null then
    insert into marriage.membership_readiness_receipts(member_id,response) values (me,receipt)
    on conflict (member_id) do nothing;
  end if;
  return result;
end $$;
revoke all on function marriage.apply_profile_before_membership_readiness(jsonb),marriage.apply_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function marriage.apply_profile(jsonb) to authenticated;
create or replace function public.marriage_apply(payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select marriage.apply_profile($1)$$;

alter function marriage.personal_data() rename to personal_data_before_membership_readiness;
create function marriage.personal_data() returns jsonb
language sql stable security definer set search_path='' as $$
  select marriage.personal_data_before_membership_readiness() || jsonb_build_object('membershipReadiness',
    (select jsonb_build_object('responses',r.response,'acceptedAt',r.accepted_at)
       from marriage.membership_readiness_receipts r where r.member_id = auth.uid()));
$$;
revoke all on function marriage.personal_data_before_membership_readiness(),marriage.personal_data() from public, anon, authenticated, service_role;
grant execute on function marriage.personal_data() to authenticated;
create or replace function public.marriage_personal_data() returns jsonb
language sql stable security invoker set search_path='' as $$select marriage.personal_data()$$;

-- Extend the existing private draft allowlists without changing its ownership,
-- expiry, or permission checks.
do $$
declare original text := pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
begin
  if strpos(original,'''preferences'',''review''')=0
    or strpos(original,'''publicAvatar'',''appearanceVersion'',''beena''')=0
    or strpos(original,'answers:=payload->''answers'';')=0 then
    raise exception 'Unexpected onboarding draft definition';
  end if;
  execute replace(replace(replace(original,
    '''preferences'',''review''', '''preferences'',''readiness'',''review'''),
    '''publicAvatar'',''appearanceVersion'',''beena''', '''publicAvatar'',''appearanceVersion'',''beena'',''membershipReadiness'''),
    'answers:=payload->''answers'';',
    $validation$answers:=payload->'answers';
    if answers?'membershipReadiness' and not marriage.valid_membership_readiness(answers->'membershipReadiness') then
      raise exception 'مواقف الجاهزية غير صالحة.' using errcode='22023';
    end if;$validation$);
end $$;
