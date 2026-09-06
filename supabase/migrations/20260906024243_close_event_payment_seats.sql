insert into public.twilio_response_rules
  (action_key, label, trigger_payload, response_text, description, enabled, sort_order)
values
  (
    'event_payment_seats_full',
    'Event payment seats full',
    null,
    E'اكتملت جميع المقاعد لهذه الفعالية، لذلك أغلقنا استقبال الدفعات الجديدة ولن نتمكن من تأكيد حجز إضافي هذه المرة. حظاً أوفر في الفعالية القادمة 🤍',
    'When enabled, blocks payment details and receipt intake for unpaid participants. Enabled at the 2026-09-06 05:00 Asia/Riyadh cutoff; paid and payment-waived participants continue normally.',
    true,
    9
  )
on conflict (action_key) do update
set label = excluded.label,
    trigger_payload = excluded.trigger_payload,
    response_text = excluded.response_text,
    description = excluded.description,
    enabled = excluded.enabled,
    sort_order = excluded.sort_order,
    updated_at = now();
