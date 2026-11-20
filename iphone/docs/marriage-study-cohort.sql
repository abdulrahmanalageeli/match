-- Restricted analysis only, after verification of both members' study permissions.
-- One baseline per connected pair, including pairs who close before the first survey.
select p.request_id, md5('connection-pilot/'||r.requester_id::text) as requester_group,
  md5('connection-pilot/'||r.recipient_id::text) as recipient_group, p.connected_at, r.closed_at,
  p.practical_score, p.personality_score,
  p.feature_snapshot#>'{practicalEvidence,topics}' as practical_topics,
  p.feature_snapshot#>'{requester,personality}' as requester_traits,
  p.feature_snapshot#>'{recipient,personality}' as recipient_traits,
  a.week_review->>'marriagePotential' as requester_potential,
  b.week_review->>'marriagePotential' as recipient_potential
from marriage.conversation_pilot p join marriage.member_requests r on r.id=p.request_id
left join marriage.conversation_pilot_responses a on a.request_id=p.request_id and a.member_id=r.requester_id
left join marriage.conversation_pilot_responses b on b.request_id=p.request_id and b.member_id=r.recipient_id
where p.connected_at is not null and p.enrolled_at<=p.connected_at
  and p.feature_snapshot->>'schema'='connection-feedback-v1'
  and p.feature_snapshot#>>'{requester,assessment}'='marriage-v4'
  and p.feature_snapshot#>>'{recipient,assessment}'='marriage-v4'
  and p.feature_snapshot#>>'{requester,personalityVersion}'='personality-v2'
  and p.feature_snapshot#>>'{recipient,personalityVersion}'='personality-v2'
  and not exists(select 1 from marriage.blocks where member_id in(r.requester_id,r.recipient_id) and blocked_id in(r.requester_id,r.recipient_id))
  and not exists(select 1 from marriage.reports where member_id in(r.requester_id,r.recipient_id) and reported_id in(r.requester_id,r.recipient_id))
order by p.connected_at,p.request_id;
