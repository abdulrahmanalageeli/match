alter table public.participants
  add column if not exists seat_payment_reminder_sent boolean not null default false;

comment on column public.participants.seat_payment_reminder_sent is
  'True after a successful send using the seat payment deadline reminder template.';
