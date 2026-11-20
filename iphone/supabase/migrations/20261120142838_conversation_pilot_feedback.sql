-- Enrollment is explicit and freezes the pair scores before the request is accepted.
create table marriage.conversation_pilot (
  request_id uuid primary key references marriage.member_requests(id) on delete cascade,
  enrolled_at timestamptz not null default statement_timestamp(),
  arm text not null check (arm in ('baseline','candidate')),
  model_version text not null,
  connected_at timestamptz,
  feature_snapshot jsonb not null,
  practical_score smallint check (practical_score between 0 and 100),
  personality_score smallint check (personality_score between 0 and 100)
);
create table marriage.conversation_pilot_responses (
  request_id uuid references marriage.conversation_pilot(request_id) on delete cascade,
  member_id uuid references marriage.members(id) on delete cascade,
  talked boolean,
  first_answered_at timestamptz,
  week_review jsonb,
  week_answered_at timestamptz,
  exit_review jsonb,
  exit_answered_at timestamptz,
  enjoyed boolean,
  wants_to_continue boolean,
  followup_talked boolean,
  primary key (request_id,member_id),
  check ((talked and enjoyed is not null and wants_to_continue is not null)
      or (not talked and enjoyed is null and wants_to_continue is null))
);
create index conversation_pilot_responses_member on marriage.conversation_pilot_responses(member_id);
alter table marriage.conversation_pilot enable row level security;
alter table marriage.conversation_pilot_responses enable row level security;
revoke all on marriage.conversation_pilot,marriage.conversation_pilot_responses from public,anon,authenticated,service_role;

create function marriage.start_feedback_clock() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.data->>'status'='accepted' then
    update marriage.conversation_pilot set connected_at=(new.data->>'manSignedAt')::timestamptz
      where request_id=new.request_id and connected_at is null;
  end if;
  return new;
end $$;
revoke all on function marriage.start_feedback_clock() from public,anon,authenticated;
create trigger start_feedback_clock after insert or update on marriage.conversation_agreements
for each row execute function marriage.start_feedback_clock();

create function marriage.enroll_conversation_pilot(request_key uuid, assigned_arm text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  request marriage.member_requests;
  comparison jsonb;
begin
  select r.* into request
    from marriage.member_requests r
    join marriage.fit_observations o on o.request_id=r.id
    where r.id=request_key and r.status='pending' and r.created_at>statement_timestamp()-interval '7 days'
    for share of r;
  if not found then return false; end if;
  select f.fit into strict comparison from marriage.pair_fit(request.requester_id,request.recipient_id) f;
  insert into marriage.conversation_pilot(request_id,arm,model_version,practical_score,personality_score,feature_snapshot)
    values(request_key,assigned_arm,comparison->>'version',(comparison->>'percentage')::smallint,
      (comparison->>'partnerPersonalityFit')::smallint,
      jsonb_build_object('practicalEvidence',comparison->'preferenceEvidence','schema','connection-feedback-v1') ||
      (select jsonb_object_agg(side,jsonb_build_object('assessment',assessment.version,
        'personalityVersion',case when assessment.version='marriage-v4' then 'personality-v2' else 'personality-v1' end,
        'practical',(select jsonb_object_agg(question_code,option_code) from marriage.member_answers where member_id=participant),
        'personality',(select jsonb_object_agg(question_code,option_code) from marriage.personality_answers where member_id=participant)))
       from (values ('requester',request.requester_id),('recipient',request.recipient_id)) as members(side,participant)
       left join marriage.member_assessment assessment on assessment.member_id=participant))
    on conflict(request_id) do nothing;
  return found;
end $$;

create function marriage.conversation_pilot_response(request_key uuid, action text, answer jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me uuid:=marriage.require_discovery_member();
  own marriage.conversation_pilot_responses;
  had_conversation boolean;
  first_open boolean;
  followup_open boolean;
  mutual_continue boolean;
  exit_open boolean;
  stage text;
  started timestamptz;
  r marriage.member_requests;
begin
  select * into r from marriage.member_requests where id=request_key and me in(requester_id,recipient_id) for share;
  if not found then return null; end if;
  select connected_at into started from marriage.conversation_pilot where request_id=request_key;
  if not found or exists(select 1 from marriage.blocks where member_id in(r.requester_id,r.recipient_id) and blocked_id in(r.requester_id,r.recipient_id))
    or exists(select 1 from marriage.reports where member_id in(r.requester_id,r.recipient_id) and reported_id in(r.requester_id,r.recipient_id)) then return null; end if;
  exit_open:=r.status in('cancelled','closed') and r.closure_outcome='closed' and r.closed_at>now()-interval '7 days'
    and exists(select 1 from marriage.fit_observations where request_id=request_key and accepted_at is not null);
  first_open:=r.status='accepted' and started<=now()-interval '48 hours' and started>now()-interval '7 days';
  followup_open:=r.status='accepted' and started<=now()-interval '7 days' and started>now()-interval '14 days';
  stage:=case when exit_open then 'exit' when followup_open then 'week' when first_open then 'first' end;
  if stage is null then return null; end if;
  if action in ('week','exit') then
    if action<>stage then return null; end if;
    if answer->>'instrument'='week-v2' then
      if stage<>'week' or
        (answer - array['instrument','contact','marriagePotential','personalFit','practicalFit','mainFactor']) <> '{}'::jsonb or
        coalesce(answer->>'contact','') not in ('none','once','repeated') or
        (answer->>'contact'='none' and answer ?| array['marriagePotential','personalFit','practicalFit','mainFactor']) or
        (answer->>'contact'<>'none' and (
          coalesce(answer->>'marriagePotential','') not in ('yes','no','too_early') or
          coalesce(answer->>'personalFit','') not in ('well','partly','poorly','too_early') or
          coalesce(answer->>'practicalFit','') not in ('aligned','partial','different','not_discussed','unclear'))) or
        (answer ? 'mainFactor' and coalesce(answer->>'mainFactor','') not in
          ('conversation','respect','initiative','values','plans','circumstances','other','nothing_specific')) then
        raise exception 'إجابة غير صالحة' using errcode='22023';
      end if;
    elsif answer is not null and (jsonb_typeof(answer)<>'object' or
      (answer - array['contact','enjoyed','continue','marriagePotential','familyContact','reason','topic']) <> '{}'::jsonb or
      coalesce(answer->>'contact','') not in ('none','once','repeated') or
      (answer->>'contact'='none' and answer ?| array['enjoyed','continue','marriagePotential']) or
      (answer ? 'marriagePotential' and coalesce(answer->>'marriagePotential','') not in ('yes','no','too_early')) or
      (answer ? 'familyContact' and (stage<>'exit' or coalesce(answer->>'familyContact','') not in ('yes','no','unknown'))) or
      (answer->>'contact'<>'none' and (coalesce(answer->>'enjoyed','') not in ('yes','no','unsure') or
        coalesce(answer->>'continue','') not in ('yes','no','unsure'))) or
      (answer ? 'reason' and coalesce(answer->>'reason','') not in ('timing','no_reply','practical','personality','practical_strength','personality_strength','no_connection','offline','other')) or
      (answer ? 'topic' and (coalesce(answer->>'reason','') not in ('practical','personality','practical_strength','personality_strength') or
        not coalesce(answer->>'topic'='other' or
          (answer->>'reason' in ('practical','practical_strength') and exists(select 1 from marriage.assessment_versions v,
            jsonb_array_elements(v.catalog->'dimensions') d where v.id='marriage-v4' and d->>'id'=answer->>'topic')) or
          (answer->>'reason' in ('personality','personality_strength') and answer->>'topic' in ('partner_stability','partner_reliability','partner_warmth','partner_social_energy','partner_openness')),false)))) then
      raise exception 'إجابة غير صالحة' using errcode='22023';
    end if;
    if stage='week' then
      insert into marriage.conversation_pilot_responses(request_id,member_id,week_review,week_answered_at,followup_talked)
        values(request_key,me,answer,case when answer is not null then now() end,answer->>'contact'='repeated')
        on conflict(request_id,member_id) do update set week_review=excluded.week_review,week_answered_at=excluded.week_answered_at,followup_talked=excluded.followup_talked;
    else
      insert into marriage.conversation_pilot_responses(request_id,member_id,exit_review,exit_answered_at)
        values(request_key,me,answer,case when answer is not null then now() end)
        on conflict(request_id,member_id) do update set exit_review=excluded.exit_review,exit_answered_at=excluded.exit_answered_at;
    end if;
  end if;
  if action in ('save','withdraw') and stage<>'first' then return null; end if;
  if action='withdraw' then
    delete from marriage.conversation_pilot_responses p where p.request_id=request_key and p.member_id=me;
  elsif action='save' then
    had_conversation:=answer->'talked'='true'::jsonb;
    if jsonb_typeof(answer->'talked') is distinct from 'boolean' or
      (had_conversation and (jsonb_typeof(answer->'enjoyed') is distinct from 'boolean'
        or jsonb_typeof(answer->'continue') is distinct from 'boolean')) then
      raise exception 'أكمل الإجابات أولًا.' using errcode='22023';
    end if;
    insert into marriage.conversation_pilot_responses(request_id,member_id,talked,enjoyed,wants_to_continue,first_answered_at)
      values(request_key,me,had_conversation,
        case when had_conversation then (answer->>'enjoyed')::boolean end,
        case when had_conversation then (answer->>'continue')::boolean end,now())
      on conflict(request_id,member_id) do update set
        talked=excluded.talked,enjoyed=excluded.enjoyed,wants_to_continue=excluded.wants_to_continue,first_answered_at=excluded.first_answered_at;
  elsif action not in ('read','followup','week','exit') or action is null then
    raise exception 'Unknown conversation pilot action' using errcode='22023';
  end if;
  select * into own from marriage.conversation_pilot_responses p where p.request_id=request_key and p.member_id=me;
  mutual_continue:=coalesce(own.talked and own.wants_to_continue,false) and exists (
    select 1 from marriage.conversation_pilot_responses p
    where p.request_id=request_key and p.member_id<>me and p.talked and p.wants_to_continue
  );
  if stage='exit' then mutual_continue:=false; end if;
  if action='followup' then
    if stage<>'week' then return null; end if;
    if answer is not null and jsonb_typeof(answer->'followupTalked') is distinct from 'boolean' then
      raise exception 'اختر إجابتك أولًا.' using errcode='22023';
    end if;
    update marriage.conversation_pilot_responses p
      set followup_talked=(answer->>'followupTalked')::boolean
      where p.request_id=request_key and p.member_id=me returning * into own;
  end if;
  return jsonb_build_object('answer',case when own.talked is not null then
    jsonb_strip_nulls(jsonb_build_object('talked',own.talked,'enjoyed',own.enjoyed,'continue',own.wants_to_continue)) end,
    'mutualContinue',mutual_continue,'initialOpen',coalesce(first_open,false),'followupOpen',coalesce(followup_open,false),'followupTalked',own.followup_talked)
    || case when stage in ('week','exit') then jsonb_build_object('stage',stage,'review',case when exit_open then own.exit_review else own.week_review end) else '{}'::jsonb end;
end $$;

-- Both members' responses contribute to the report. A missing reply remains unknown.
-- Only closed observation windows enter the comparison.
create function marriage.conversation_pilot_totals()
returns table(arm text, version text, practical_band integer, personality_band integer, introductions bigint,
  confirmed_conversation bigint, both_continue bigint, both_enjoyed_and_continue bigint, known_failure bigint, unknown bigint,
  followup_eligible bigint, confirmed_followup bigint, followup_unknown bigint)
language sql stable security definer set search_path='' as $$
  with outcomes as (
    select p.arm,p.model_version,p.practical_score/10 as practical_bucket,p.personality_score/10 as personality_bucket,
      a.talked and b.talked as talked,
      a.talked and b.talked and a.wants_to_continue and b.wants_to_continue as continued,
      a.talked and b.talked and a.enjoyed and b.enjoyed and a.wants_to_continue and b.wants_to_continue as success,
      p.connected_at<=statement_timestamp()-interval '14 days' as followup_closed,
      (r.closed_at is null or r.closed_at>=p.connected_at+interval '7 days') as rpt_active,
      a.followup_talked and b.followup_talked as talked_again
    from marriage.conversation_pilot p
    join marriage.member_requests r on r.id=p.request_id
    left join marriage.conversation_pilot_responses a on a.request_id=p.request_id and a.member_id=r.requester_id
    left join marriage.conversation_pilot_responses b on b.request_id=p.request_id and b.member_id=r.recipient_id
    where p.connected_at<=statement_timestamp()-interval '7 days'
  )
  select outcomes.arm,model_version,practical_bucket,personality_bucket,count(*),
    count(*) filter(where talked),count(*) filter(where continued),count(*) filter(where success),
    count(*) filter(where success is false),count(*) filter(where success is null),
    count(*) filter(where followup_closed and (rpt_active or talked_again is not null)),
    count(*) filter(where followup_closed and talked_again),
    count(*) filter(where followup_closed and rpt_active and talked_again is null)
  from outcomes group by 1,2,3,4 order by 1,2,3,4
$$;

create function public.marriage_enroll_conversation_pilot(request_key uuid, assigned_arm text)
returns boolean language sql security invoker set search_path='' as $$
  select marriage.enroll_conversation_pilot($1,$2)
$$;
create function public.marriage_conversation_pilot_response(request_key uuid, action text default 'read', answer jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
  select marriage.conversation_pilot_response($1,$2,$3)
$$;
create function public.marriage_conversation_pilot_totals()
returns table(arm text, version text, practical_band integer, personality_band integer, introductions bigint,
  confirmed_conversation bigint, both_continue bigint, both_enjoyed_and_continue bigint, known_failure bigint, unknown bigint,
  followup_eligible bigint, confirmed_followup bigint, followup_unknown bigint)
language sql stable security invoker set search_path='' as $$select * from marriage.conversation_pilot_totals()$$;

revoke all on function marriage.enroll_conversation_pilot(uuid,text), public.marriage_enroll_conversation_pilot(uuid,text),
  marriage.conversation_pilot_response(uuid,text,jsonb), public.marriage_conversation_pilot_response(uuid,text,jsonb),
  marriage.conversation_pilot_totals(), public.marriage_conversation_pilot_totals() from public,anon,authenticated,service_role;
grant execute on function marriage.enroll_conversation_pilot(uuid,text), public.marriage_enroll_conversation_pilot(uuid,text),
  marriage.conversation_pilot_totals(), public.marriage_conversation_pilot_totals() to service_role;
grant execute on function marriage.conversation_pilot_response(uuid,text,jsonb),
  public.marriage_conversation_pilot_response(uuid,text,jsonb) to authenticated;

-- The private feed needs only the due time and stage for this member.
create function marriage.conversation_pilot_notices() returns jsonb
language sql stable security definer set search_path='' as $$
  with viewer as materialized (select marriage.require_discovery_member() as id)
  select coalesce(jsonb_agg(jsonb_build_object('requestId',r.id,'stage',w.stage,'at',w.due)), '[]'::jsonb)
  from viewer v join marriage.member_requests r on v.id in (r.requester_id,r.recipient_id)
  join marriage.conversation_pilot p on p.request_id=r.id
  left join marriage.conversation_pilot_responses a on a.request_id=r.id and a.member_id=v.id
  cross join lateral (values
    ('day2', p.connected_at+interval '48 hours', p.connected_at+interval '7 days', a.first_answered_at),
    ('week', p.connected_at+interval '7 days', p.connected_at+interval '14 days', a.week_answered_at)
  ) w(stage,due,expires,answered)
  where r.status='accepted' and now()>=w.due and now()<w.expires and w.answered is null
    and not exists(select 1 from marriage.blocks where member_id in(r.requester_id,r.recipient_id) and blocked_id in(r.requester_id,r.recipient_id))
    and not exists(select 1 from marriage.reports where member_id in(r.requester_id,r.recipient_id) and reported_id in(r.requester_id,r.recipient_id))
$$;
create function public.marriage_conversation_pilot_notices() returns jsonb
language sql stable security invoker set search_path='' as $$ select marriage.conversation_pilot_notices() $$;
revoke all on function marriage.conversation_pilot_notices(),public.marriage_conversation_pilot_notices() from public,anon,service_role;
grant execute on function marriage.conversation_pilot_notices(),public.marriage_conversation_pilot_notices() to authenticated;
