insert into public.twilio_templates (
  template_key,
  friendly_name,
  description,
  content_sid,
  category,
  language,
  content_type,
  approval_status,
  body_text,
  variables,
  buttons,
  enabled,
  sort_order
)
values (
  'seat_payment_deadline',
  'seat_payment_deadline',
  'Seat allocation payment deadline; variable 2 is generated exactly 30 minutes after send.',
  'HX8926122fdbf2f52a8bb0957332344c8e',
  'UTILITY',
  'ar',
  'twilio/quick-reply',
  'approved',
  '*تحديث حالة حجزك* مرحباً {{1}}، تم تخصيص مقعد لك في الفعالية الحالية، وما زال تأكيد الحجز بانتظار إتمام الدفع. يرجى إتمام الدفع قبل *{{2}}*. إذا لم يتم استلام الدفعة قبل هذا الموعد، سيُلغى حجز المقعد تلقائياً بسبب اكتمال السعة. يمكنك عرض تفاصيل الدفع أو إلغاء الحجز من الأزرار أدناه. — *فريق التوافق الأعمى*',
  '[{"key":"1","label":"Participant name"},{"key":"2","label":"Payment deadline (30 minutes after send, Asia/Riyadh)"}]'::jsonb,
  '[{"title":"عرض تفاصيل الدفع","id":"payment_request"},{"title":"الغاء الحجز","id":"deny_attendance"}]'::jsonb,
  true,
  35
)
on conflict (template_key) do update
set friendly_name = excluded.friendly_name,
    description = excluded.description,
    content_sid = excluded.content_sid,
    category = excluded.category,
    language = excluded.language,
    content_type = excluded.content_type,
    approval_status = excluded.approval_status,
    body_text = excluded.body_text,
    variables = excluded.variables,
    buttons = excluded.buttons,
    enabled = excluded.enabled,
    sort_order = excluded.sort_order,
    updated_at = now();
