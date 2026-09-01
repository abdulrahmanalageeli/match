update public.event_state
set whatsapp_config = jsonb_set(
  jsonb_set(
    coalesce(whatsapp_config, '{}'::jsonb),
    '{eventDateText}',
    to_jsonb('الأحد 6 سبتمبر 2026'::text),
    true
  ),
  '{eventName}',
  to_jsonb('التوافق الأعمى 5.0 — نسخة الاختيارات فقط'::text),
  true
)
where match_id = '00000000-0000-0000-0000-000000000000'::uuid
  and current_event_id = 27;

select public.set_event3_event_format(
  '00000000-0000-0000-0000-000000000003'::uuid,
  27,
  'choice_only_three_groups'
);
