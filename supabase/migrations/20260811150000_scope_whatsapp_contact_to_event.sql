alter table public.participants
  add column if not exists whatsapp_contacted_event_id integer,
  add column if not exists payment_waived_event_id integer,
  add column if not exists payment_completed_event_id integer;

comment on column public.participants.whatsapp_contacted_event_id is
  'Active event for which an organizer marked or successfully messaged this participant as contacted. Used to authorize payment replies.';

comment on column public.participants.payment_waived_event_id is
  'Event for which payment_waived applies. A waiver is invalid unless this equals the active event.';

comment on column public.participants.payment_completed_event_id is
  'Event for which PAID_DONE applies. A completed payment is invalid unless this equals the active event.';

create index if not exists idx_participants_whatsapp_contacted_event
  on public.participants (match_id, whatsapp_contacted_event_id)
  where whatsapp_contacted_event_id is not null;

create index if not exists idx_participants_payment_waived_event
  on public.participants (match_id, payment_waived_event_id)
  where payment_waived is true;

create index if not exists idx_participants_payment_completed_event
  on public.participants (match_id, payment_completed_event_id)
  where "PAID_DONE" is true;

-- Preserve the organizer's current admin state at deployment. From this point
-- onward every mark/send writes the event explicitly, so old-event contact can
-- no longer authorize replies after the active event changes.
update public.participants as participant
set whatsapp_contacted_event_id = state.current_event_id
from public.event_state as state
where state.match_id = participant.match_id
  and participant."PAID" is true
  and state.current_event_id is not null
  and (
    participant.event_id = state.current_event_id
    or participant.signup_event_id = state.current_event_id
    or participant.auto_signup_next_event is true
  );

-- Preserve current waivers only for participants belonging to the active event.
-- Old global waivers deliberately remain unscoped and therefore cannot carry
-- forward into the next event.
update public.participants as participant
set payment_waived_event_id = state.current_event_id
from public.event_state as state
where state.match_id = participant.match_id
  and participant.payment_waived is true
  and state.current_event_id is not null
  and (
    participant.event_id = state.current_event_id
    or participant.signup_event_id = state.current_event_id
    or participant.auto_signup_next_event is true
  );

update public.participants as participant
set payment_completed_event_id = state.current_event_id
from public.event_state as state
where state.match_id = participant.match_id
  and participant."PAID_DONE" is true
  and state.current_event_id is not null
  and (
    participant.event_id = state.current_event_id
    or participant.signup_event_id = state.current_event_id
    or participant.auto_signup_next_event is true
  );

insert into public.twilio_response_rules
  (action_key, label, trigger_payload, response_text, description, sort_order)
values
  (
    'current_event_signup_required',
    'Current event signup required',
    'confirm_attendance',
    E'أهلاً بك 👋\n\nلا يظهر لدينا تسجيلك في الفعالية الحالية بعد. إذا رغبت بالانضمام إلى قائمة المرشحين، أرسل كلمة *انضمام*.\n\nبعد التسجيل سنراجع التوافق، وسنتواصل معك مباشرة عند توفر توافق مناسب. لا يلزم أي دفع قبل وصول رسالة تأكيد منا.',
    'Sent instead of payment details when the participant is not enrolled in the active event.',
    5
  ),
  (
    'current_event_joined',
    'Joined current event',
    'انضمام',
    E'✅ تم تسجيل اهتمامك بالانضمام إلى الفعالية الحالية.\n\nسندرج ملفك ضمن قائمة المرشحين ونراجع التوافق بعناية. سنتواصل معك مباشرة إذا وجدنا توافقاً مناسباً — ولا يلزم أي دفع الآن.',
    'Confirms WhatsApp enrollment without implying that a match or payment request exists.',
    6
  ),
  (
    'current_event_already_joined',
    'Already joined current event',
    'انضمام',
    E'✅ أنت مسجل بالفعل ضمن قائمة المرشحين للفعالية الحالية.\n\nما زلنا نراجع التوافق، وسنتواصل معك مباشرة عند توفر توافق مناسب. لا يلزم أي دفع قبل وصول رسالة تأكيد منا.',
    'Used when an enrolled participant sends the join keyword again.',
    7
  ),
  (
    'current_event_not_contacted',
    'No current event match confirmation',
    'confirm_attendance',
    E'شكراً لتواصلك 🤍\n\nلم نرسل لك تأكيد توافق للفعالية الحالية حتى الآن. ما زلنا نراجع الترشيحات، وسنتواصل معك مباشرة إذا وجدنا توافقاً مناسباً.\n\nحرصاً على وضوح الإجراءات، لا يلزم أي دفع إلا بعد وصول رسالة تأكيد رسمية منا لهذه الفعالية.',
    'Sent instead of payment details when admin has not contacted the participant for the active event.',
    8
  ),
  (
    'participant_not_registered',
    'Participant phone not registered',
    null,
    E'أهلاً بك 👋\n\nلم نتمكن من العثور على ملف مشارك مرتبط بهذا الرقم. يرجى التسجيل أولاً من خلال المنصة، أو التواصل معنا إذا كنت مسجلاً برقم مختلف.\n\nلا يلزم إجراء أي دفع في هذه المرحلة.',
    'Safe response for inbound messages from an unknown phone number.',
    9
  )
on conflict (action_key) do update
set label = excluded.label,
    trigger_payload = excluded.trigger_payload,
    response_text = excluded.response_text,
    description = excluded.description,
    sort_order = excluded.sort_order,
    updated_at = now();
