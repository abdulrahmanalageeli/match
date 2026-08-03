update public.twilio_templates
set variables = '[
  {"key":"1","label":"Participant number (action)"},
  {"key":"2","label":"Secure token (action URL)"},
  {"key":"3","label":"Event date"},
  {"key":"4","label":"Event time"},
  {"key":"5","label":"Arrival time"},
  {"key":"6","label":"Location"},
  {"key":"7","label":"Map URL"}
]'::jsonb,
updated_at = now()
where template_key = 'match';
