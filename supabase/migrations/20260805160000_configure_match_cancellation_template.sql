update public.twilio_templates
set
  friendly_name = 'match_cancelled_refund_or_next_event',
  content_sid = 'HX466c880e6809cefe45123a5c02d49a61',
  category = 'UTILITY',
  language = 'ar',
  content_type = 'twilio/quick-reply',
  approval_status = 'approved',
  body_text = 'السلام عليكم *{{1}}*، نأسف لإبلاغك بأن شريك التوافق اعتذر عن حضور الفعالية، ولذلك لن نتمكن من إكمال اللقاء المقرر لك هذه المرة. يمكنك اختيار أحد الخيارين أدناه: • طلب استرداد رسوم المشاركة • الاحتفاظ بالمبلغ كرصيد للفعالية القادمة اختر ما يناسبك، وسنسجل طلبك ونتابع معك مباشرة. نعتذر عن هذا التغيير الخارج عن إرادتنا، ونقدّر تفهمك 🤍 — *فريق التوافق الأعمى*',
  variables = '[{"key":"1","label":"Participant name"}]'::jsonb,
  buttons = '[{"title":"طلب استرداد","id":"cancellation_refund"},{"title":"للفعالية القادمة","id":"cancellation_next_event"}]'::jsonb,
  enabled = true,
  updated_at = now()
where template_key = 'match_cancellation';

