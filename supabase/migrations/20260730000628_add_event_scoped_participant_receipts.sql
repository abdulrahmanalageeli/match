create table if not exists public.participant_receipts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  assigned_number integer not null,
  event_id integer not null check (event_id > 0),
  storage_path text,
  receipt_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'superseded')),
  received_at timestamptz not null default now(),
  reviewed_at timestamptz,
  rejection_reason text,
  source_message_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists participant_receipts_participant_event_received_idx
  on public.participant_receipts (participant_id, event_id, received_at desc);

create index if not exists participant_receipts_event_pending_idx
  on public.participant_receipts (event_id, received_at desc)
  where status = 'pending';

create unique index if not exists participant_receipts_event_url_uidx
  on public.participant_receipts (participant_id, event_id, receipt_url);

create unique index if not exists participant_receipts_one_approved_per_event_uidx
  on public.participant_receipts (participant_id, event_id)
  where status = 'approved';

alter table public.participant_receipts enable row level security;
revoke all on public.participant_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.participant_receipts to service_role;

-- Legacy receipt columns had no event identity. They represented the active
-- event at the time, so backfill them to the organizer's current event rather
-- than the participant's original registration event.
with active_event as (
  select coalesce(
    (select current_event_id
     from public.event_state
     where match_id = '00000000-0000-0000-0000-000000000000'
     limit 1),
    1
  )::integer as event_id
)
insert into public.participant_receipts (
  participant_id,
  assigned_number,
  event_id,
  receipt_url,
  status,
  received_at,
  reviewed_at,
  created_at,
  updated_at
)
select
  p.id,
  p.assigned_number,
  active_event.event_id,
  p.receipt_url,
  case
    when p.receipt_approved is true then 'approved'
    when p.receipt_rejected is true then 'rejected'
    else 'pending'
  end,
  coalesce(p.receipt_received_at, p.updated_at, now()),
  coalesce(p.receipt_approved_at, p.receipt_rejected_at),
  coalesce(p.receipt_received_at, p.updated_at, now()),
  now()
from public.participants p
cross join active_event
where p.receipt_url is not null
on conflict (participant_id, event_id, receipt_url) do nothing;

-- A no-response participant must not remain eligible or display a global
-- receipt. The event-scoped row above preserves the full payment history.
update public.participants
set
  "PAID_DONE" = false,
  payment_waived = false,
  receipt_url = null,
  receipt_received_at = null,
  receipt_approved = false,
  receipt_approved_at = null,
  receipt_rejected = false,
  receipt_rejected_at = null
where match_id = '00000000-0000-0000-0000-000000000000'
  and attendance_confirmed is false
  and attendance_denied_at is null
  and receipt_url is not null;
