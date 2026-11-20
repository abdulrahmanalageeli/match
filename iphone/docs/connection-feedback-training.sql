-- Restricted research query for purpose-consented pilot pairs. One row per eligible pair/window.
with observations as (
  select p.request_id, md5('connection-pilot/'||r.requester_id::text) as requester_group,
    md5('connection-pilot/'||r.recipient_id::text) as recipient_group,
    p.model_version, p.feature_snapshot, p.practical_score, p.personality_score,
    p.enrolled_at, p.connected_at, r.closed_at, o.formal_at, s.stage, s.window_end,
    case s.stage when 'day2' then jsonb_strip_nulls(jsonb_build_object('talked', a.talked, 'enjoyed', a.enjoyed, 'continue', a.wants_to_continue))
      when 'week' then a.week_review else a.exit_review end as requester,
    case s.stage when 'day2' then jsonb_strip_nulls(jsonb_build_object('talked', b.talked, 'enjoyed', b.enjoyed, 'continue', b.wants_to_continue))
      when 'week' then b.week_review else b.exit_review end as recipient,
    case s.stage when 'day2' then a.first_answered_at when 'week' then a.week_answered_at else a.exit_answered_at end as requester_answered_at,
    case s.stage when 'day2' then b.first_answered_at when 'week' then b.week_answered_at else b.exit_answered_at end as recipient_answered_at
  from marriage.conversation_pilot p join marriage.member_requests r on r.id=p.request_id
  join marriage.fit_observations o on o.request_id=p.request_id and o.accepted_at is not null
  left join marriage.conversation_pilot_responses a on a.request_id=p.request_id and a.member_id=r.requester_id
  left join marriage.conversation_pilot_responses b on b.request_id=p.request_id and b.member_id=r.recipient_id
  cross join lateral (values
    ('day2', p.connected_at+interval '48 hours', least(p.connected_at+interval '7 days',r.closed_at)),
    ('week', p.connected_at+interval '7 days', least(p.connected_at+interval '14 days',r.closed_at)),
    ('exit', case when r.closure_outcome='closed' then r.closed_at end, r.closed_at+interval '7 days')
  ) s(stage,window_start,window_end)
  where s.window_start<s.window_end and s.window_end<=statement_timestamp()
    and not exists(select 1 from marriage.blocks where member_id in(r.requester_id,r.recipient_id) and blocked_id in(r.requester_id,r.recipient_id))
    and not exists(select 1 from marriage.reports where member_id in(r.requester_id,r.recipient_id) and reported_id in(r.requester_id,r.recipient_id))
), sides as (
  select observations.*, side,
    case v->>'marriagePotential' when 'yes' then true when 'no' then false end as sees_marriage_potential,
    case when stage='day2' then (v->>'talked')::boolean and (v->>'enjoyed')::boolean and (v->>'continue')::boolean
      when v->>'instrument'='week-v2' then null
      when v->>'contact'='none' or v->>'enjoyed'='no' or v->>'continue'='no' then false
      when v->>'enjoyed'='yes' and v->>'continue'='yes' then true end as positive
  from observations cross join lateral (values ('a',requester),('b',recipient)) d(side,v)
)
select a.request_id, a.requester_group, a.recipient_group, a.stage, a.model_version, a.feature_snapshot, a.practical_score, a.personality_score,
  a.enrolled_at, a.connected_at, a.closed_at, a.formal_at as formal_step_agreed_at, a.window_end, a.requester, a.recipient,
  a.requester_answered_at, a.recipient_answered_at, a.positive as requester_positive, b.positive as recipient_positive,
  a.requester->>'personalFit' as requester_personal_fit, a.recipient->>'personalFit' as recipient_personal_fit,
  a.requester->>'practicalFit' as requester_practical_fit, a.recipient->>'practicalFit' as recipient_practical_fit,
  a.requester->>'mainFactor' as requester_main_factor, a.recipient->>'mainFactor' as recipient_main_factor,
  a.positive and b.positive as both_enjoyed_and_wanted_to_continue,
  a.sees_marriage_potential and b.sees_marriage_potential as mutual_perceived_marriage_potential,
  case when a.requester->>'familyContact'='yes' and a.recipient->>'familyContact'='yes' then true
       when a.requester->>'familyContact'='no' and a.recipient->>'familyContact'='no' then false end as corroborated_family_contact,
  case when a.stage in ('week','exit') then (a.requester->>'contact'='repeated') and (a.recipient->>'contact'='repeated') end as both_reported_repeat
from sides a join sides b using(request_id,stage) where a.side='a' and b.side='b';
