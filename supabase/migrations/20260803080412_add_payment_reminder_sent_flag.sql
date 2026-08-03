alter table public.participants
  add column if not exists payment_reminder_sent boolean not null default false;

comment on column public.participants.payment_reminder_sent is
  'True after a successful send using the configured payment reminder template.';

-- Backfill only successful sends made with the approved payment SID. Messages
-- accidentally sent with another template SID remain false so they can receive
-- the corrected payment reminder.
update public.participants p
set payment_reminder_sent = true
where exists (
  select 1
  from public.whatsapp_messages wm
  where wm.participant_id = p.id
    and wm.direction = 'outbound'
    and wm.template_sid = 'HX8a8ca10f6f72e025e0b174932e1ecf5e'
    and wm.status not in ('failed', 'undelivered')
    and wm.twilio_message_sid is not null
);
