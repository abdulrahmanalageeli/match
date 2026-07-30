insert into public.twilio_response_rules
  (action_key, label, trigger_payload, response_text, description, sort_order)
values
  (
    'attendance_confirmation_pending',
    'Attendance confirmation pending organizer approval',
    'confirm_attendance',
    '✅ استلمنا طلب تأكيد حضورك. الطلب الآن بانتظار اعتماد المنظم، ولن تتغير حالة حضورك حتى تتم مراجعته.',
    'Sent when a participant requests confirmation; no attendance state changes before organizer approval.',
    35
  ),
  (
    'attendance_denial_pending',
    'Attendance cancellation pending organizer approval',
    'deny_attendance',
    '🙏 استلمنا اعتذارك عن الحضور. الطلب الآن بانتظار اعتماد المنظم، ولن تتغير حالة حضورك حتى تتم مراجعته.',
    'Sent when a participant requests cancellation; no attendance state changes before organizer approval.',
    36
  )
on conflict (action_key) do update
set
  label = excluded.label,
  trigger_payload = excluded.trigger_payload,
  response_text = excluded.response_text,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();
