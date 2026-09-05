update public.twilio_templates
set description = 'Seat allocation payment reminder with a deadline exactly 60 minutes after send.',
    variables = '[{"key":"1","label":"Participant name"},{"key":"2","label":"Payment deadline (60 minutes after send, Asia/Riyadh)"}]'::jsonb,
    updated_at = pg_catalog.now()
where template_key = 'seat_payment_deadline';
