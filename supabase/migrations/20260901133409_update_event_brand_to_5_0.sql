update public.twilio_response_rules
set response_text = replace(
  response_text,
  'التوافق الأعمى 4.0',
  'التوافق الأعمى 5.0'
)
where response_text like '%التوافق الأعمى 4.0%';

update public.event_state
set whatsapp_config = jsonb_set(
  whatsapp_config,
  '{eventName}',
  to_jsonb('التوافق الأعمى 5.0'::text),
  true
)
where whatsapp_config is not null
  and whatsapp_config->>'eventName' = 'التوافق الأعمى 4.0';
