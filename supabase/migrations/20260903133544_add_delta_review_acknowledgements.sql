-- Keep a durable, server-only admin inbox for matching-relevant participant
-- activity. Automatic compatibility-cache work does not clear this inbox;
-- only an explicit admin acknowledgement does.

create table if not exists public.delta_review_items (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  activity_at timestamptz not null,
  survey_updated boolean not null default false,
  newly_enrolled boolean not null default false,
  acknowledged_at timestamptz,
  discovered_at timestamptz not null default pg_catalog.now(),
  constraint delta_review_items_has_reason
    check (survey_updated or newly_enrolled)
);

alter table public.delta_review_items enable row level security;

revoke all on table public.delta_review_items from public, anon, authenticated;
grant select, update on table public.delta_review_items to service_role;

create or replace function public.queue_participant_delta_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  survey_changed boolean;
  enrollment_changed boolean;
  latest_activity_at timestamptz;
begin
  if tg_op = 'INSERT' then
    survey_changed := new.survey_data_updated_at is not null;
    enrollment_changed := new.created_at is not null
      or new.event_enrolled_at is not null
      or new.next_event_signup_timestamp is not null;
  else
    survey_changed := new.survey_data_updated_at is not null
      and new.survey_data_updated_at is distinct from old.survey_data_updated_at;
    enrollment_changed := (
        new.event_enrolled_at is not null
        and new.event_enrolled_at is distinct from old.event_enrolled_at
      ) or (
        new.next_event_signup_timestamp is not null
        and new.next_event_signup_timestamp is distinct from old.next_event_signup_timestamp
      );
  end if;

  if not survey_changed and not enrollment_changed then
    return null;
  end if;

  latest_activity_at := greatest(
    case when survey_changed then new.survey_data_updated_at end,
    case when enrollment_changed then new.next_event_signup_timestamp end,
    case when enrollment_changed then new.event_enrolled_at end,
    case when tg_op = 'INSERT' and enrollment_changed then new.created_at end
  );

  if latest_activity_at is null then
    return null;
  end if;

  insert into public.delta_review_items as existing (
    participant_id,
    activity_at,
    survey_updated,
    newly_enrolled,
    acknowledged_at,
    discovered_at
  ) values (
    new.id,
    latest_activity_at,
    survey_changed,
    enrollment_changed,
    null,
    pg_catalog.now()
  )
  on conflict (participant_id) do update
  set
    activity_at = excluded.activity_at,
    survey_updated = case
      when existing.acknowledged_at is null
        then existing.survey_updated or excluded.survey_updated
      else excluded.survey_updated
    end,
    newly_enrolled = case
      when existing.acknowledged_at is null
        then existing.newly_enrolled or excluded.newly_enrolled
      else excluded.newly_enrolled
    end,
    acknowledged_at = null,
    discovered_at = pg_catalog.now()
  where excluded.activity_at > existing.activity_at
     or (
       excluded.activity_at = existing.activity_at
       and existing.acknowledged_at is null
     );

  return null;
end;
$$;

revoke all on function public.queue_participant_delta_review() from public, anon, authenticated;

drop trigger if exists participants_queue_delta_review on public.participants;
create trigger participants_queue_delta_review
after insert or update of survey_data_updated_at, next_event_signup_timestamp, event_enrolled_at
on public.participants
for each row
execute function public.queue_participant_delta_review();

-- Seed every qualifying activity from the Riyadh day on which this review
-- workflow was requested. This also catches changes made before deployment.
with review_candidates as (
  select
    participant.id as participant_id,
    coalesce(
      participant.survey_data_updated_at >= timestamptz '2026-09-02 21:00:00+00',
      false
    ) as survey_updated,
    coalesce(
      greatest(
        participant.next_event_signup_timestamp,
        participant.event_enrolled_at,
        participant.created_at
      ) >= timestamptz '2026-09-02 21:00:00+00',
      false
    ) as newly_enrolled,
    greatest(
      case
        when participant.survey_data_updated_at >= timestamptz '2026-09-02 21:00:00+00'
          then participant.survey_data_updated_at
      end,
      case
        when greatest(
          participant.next_event_signup_timestamp,
          participant.event_enrolled_at,
          participant.created_at
        ) >= timestamptz '2026-09-02 21:00:00+00'
          then greatest(
            participant.next_event_signup_timestamp,
            participant.event_enrolled_at,
            participant.created_at
          )
      end
    ) as activity_at
  from public.participants as participant
  where participant.assigned_number <> 9999
)
insert into public.delta_review_items (
  participant_id,
  activity_at,
  survey_updated,
  newly_enrolled
)
select
  candidate.participant_id,
  candidate.activity_at,
  candidate.survey_updated,
  candidate.newly_enrolled
from review_candidates as candidate
where candidate.activity_at is not null
on conflict (participant_id) do nothing;

comment on table public.delta_review_items is
  'Server-only participant survey/signup review queue; items remain until explicitly acknowledged and are independent of compatibility-cache freshness.';
