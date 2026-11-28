-- analysis_decision_notice creates both the in-app notice and its actionable push.
-- Stop the old producer before reconciling jobs from the same committed analysis.
drop trigger deep_analysis_notification on marriage.deep_analyses;
drop function marriage.enqueue_analysis_push();

-- Apply the shared report's existing evidence-fingerprint check to the actionable
-- push and in-app notice as well. Leave each path's recipient and access checks intact.
do $migration$
declare
  target regprocedure;
  definition text;
  anchor constant text := $old$when 'shared' then a.status='shared'$old$;
  replacement constant text := $new$when 'shared' then a.status='shared'
     and a.fingerprint=md5(jsonb_build_object('a',marriage.deep_evidence(a.requester_id),'b',marriage.deep_evidence(a.recipient_id))::text)$new$;
begin
  foreach target in array array[
    'marriage.push_allowed(marriage.push_outbox)'::regprocedure,
    'marriage.member_update_current(marriage.notification_updates)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if array_length(string_to_array(definition,anchor),1) <> 2 then
      raise exception 'Unexpected shared analysis check in %',target;
    end if;
    execute replace(definition,anchor,replacement);
  end loop;
end $migration$;

-- Shared jobs already used the same installation/event key. Only invitations
-- had two distinct keys. A standalone job, including one from an older release,
-- keeps its original authorization, lease, and deadline.
with twins as materialized (
  select legacy.id as legacy_id, current_job.id as current_id,
    legacy.outcome='sent' as legacy_sent, current_job.outcome='sent' as current_sent,
    legacy.expires_at>now() and legacy.lease_id is not null and legacy.lease_until>now() as legacy_leased,
    current_job.expires_at>now() and current_job.lease_id is not null and current_job.lease_until>now() as current_leased,
    legacy.expires_at>now() and legacy.attempts<5 as legacy_claimable,
    current_job.expires_at>now() and current_job.attempts<5 as current_claimable
  from marriage.push_outbox legacy join marriage.push_outbox current_job
    on current_job.installation_id=legacy.installation_id and current_job.member_id=legacy.member_id
    and current_job.request_id=legacy.request_id and current_job.kind='update'
    and current_job.event_key='analysis:invited:'||split_part(legacy.event_key,':',3)
  where legacy.kind='analysis' and legacy.event_key like 'analysis:requested:%'
    and (legacy.finished_at is null or legacy.outcome='sent')
    and (current_job.finished_at is null or current_job.outcome='sent')
    and (legacy.finished_at is null or current_job.finished_at is null)
  order by legacy.id
  for update of legacy,current_job
), redundant as (
  select case
    when legacy_sent then current_id
    when current_sent then legacy_id
    -- A leased worker may already be dispatching. If only one has a live
    -- lease, prefer it. Otherwise prefer the actionable job when deliverable.
    when legacy_leased and not current_leased then current_id
    when not current_leased and not current_claimable and legacy_claimable then current_id
    else legacy_id end as id
  from twins
)
update marriage.push_outbox job set finished_at=now(),outcome='revoked',lease_id=null,lease_until=null
from redundant where job.id=redundant.id and job.finished_at is null;
