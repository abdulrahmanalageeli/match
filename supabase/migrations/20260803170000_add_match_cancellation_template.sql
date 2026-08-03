insert into public.twilio_templates
  (template_key, friendly_name, description, content_sid, category, language, content_type, approval_status, body_text, variables, buttons, enabled, sort_order)
values
  (
    'match_cancellation',
    'match_cancelled_refund_or_next_event',
    'Sent when a participant''s match cancels; offers a refund or next-event credit.',
    null,
    'UTILITY',
    'ar',
    'twilio/quick-reply',
    'unsubmitted',
    'السلام عليكم *{{1}}*،

نأسف لإبلاغك بأن شريك التوافق اعتذر عن حضور الفعالية، ولذلك لن نتمكن من إكمال اللقاء المقرر لك هذه المرة.

يمكنك اختيار أحد الخيارين أدناه:
• طلب استرداد رسوم المشاركة
• الاحتفاظ بالمبلغ كرصيد للفعالية القادمة

اختر ما يناسبك، وسنسجل طلبك ونتابع معك مباشرة.

نعتذر عن هذا التغيير الخارج عن إرادتنا، ونقدّر تفهمك 🤍
— *فريق التوافق الأعمى*',
    '[{"key":"1","label":"Participant name"}]'::jsonb,
    '[{"title":"طلب استرداد","id":"cancellation_refund"},{"title":"للفعالية القادمة","id":"cancellation_next_event"}]'::jsonb,
    true,
    90
  )
on conflict (template_key) do update set
  friendly_name = excluded.friendly_name,
  description = excluded.description,
  category = excluded.category,
  language = excluded.language,
  content_type = excluded.content_type,
  body_text = excluded.body_text,
  variables = excluded.variables,
  buttons = excluded.buttons,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.twilio_response_rules
  (action_key, label, trigger_payload, response_text, description, enabled, sort_order)
values
  (
    'cancellation_refund',
    'Match cancellation — refund requested',
    'cancellation_refund',
    '✅ تم تسجيل طلب استرداد المبلغ. سيتواصل معك المنظم لإكمال إجراءات الاسترداد.',
    'Confirms that the participant selected a refund after their match cancelled.',
    true,
    280
  ),
  (
    'cancellation_next_event',
    'Match cancellation — next-event credit',
    'cancellation_next_event',
    '✅ تم حفظ مبلغك كرصيد للفعالية القادمة، وسنتواصل معك عند فتح التسجيل.',
    'Confirms that the participant kept their payment as credit for the next event.',
    true,
    290
  )
on conflict (action_key) do update set
  label = excluded.label,
  trigger_payload = excluded.trigger_payload,
  response_text = excluded.response_text,
  description = excluded.description,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  updated_at = now();
