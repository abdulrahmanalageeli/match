-- A normal survey save updates participants.survey_data. A separate BEFORE
-- trigger derives survey_data_updated_at, but PostgreSQL evaluates an
-- "UPDATE OF" trigger from the original statement's SET list. Listening only
-- to survey_data_updated_at therefore misses survey saves that rely on the
-- derived timestamp.
drop trigger if exists participants_queue_delta_review on public.participants;
create trigger participants_queue_delta_review
after insert or update of survey_data, survey_data_updated_at, next_event_signup_timestamp, event_enrolled_at
on public.participants
for each row
execute function public.queue_participant_delta_review();

-- Restore survey activity missed since the durable review inbox launched.
-- Existing exact survey activities remain untouched, including approvals.
-- A newer or previously unrecorded survey edit reopens the item while
-- preserving an unreviewed enrollment reason when one is already present.
insert into public.delta_review_items as existing (
  participant_id,
  activity_at,
  survey_updated,
  newly_enrolled,
  acknowledged_at,
  discovered_at
)
select
  participant.id,
  participant.survey_data_updated_at,
  true,
  false,
  null,
  pg_catalog.now()
from public.participants as participant
where participant.match_id = '00000000-0000-0000-0000-000000000000'::uuid
  and participant.assigned_number <> 9999
  and participant.survey_data_updated_at >= timestamptz '2026-09-02 21:00:00+00'
  and participant.survey_data is not null
  and nullif(
    btrim(coalesce(
      participant.name,
      participant.survey_data ->> 'name',
      participant.survey_data -> 'answers' ->> 'name',
      ''
    )),
    ''
  ) is not null
on conflict (participant_id) do update
set
  activity_at = greatest(existing.activity_at, excluded.activity_at),
  survey_updated = true,
  newly_enrolled = case
    when existing.acknowledged_at is null then existing.newly_enrolled
    else false
  end,
  acknowledged_at = null,
  discovered_at = pg_catalog.now()
where existing.survey_updated is distinct from true
   or excluded.activity_at > existing.activity_at;
