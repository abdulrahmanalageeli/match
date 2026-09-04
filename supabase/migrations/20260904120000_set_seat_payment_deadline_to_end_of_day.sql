update public.twilio_templates
set description = 'Seat allocation payment reminder with an end-of-day 11:59 PM deadline.',
    variables = '[{"key":"1","label":"Participant name"},{"key":"2","label":"Payment deadline (11:59 PM, Asia/Riyadh)"}]'::jsonb,
    updated_at = now()
where template_key = 'seat_payment_deadline';
