update public.twilio_templates
set variables = '[
  {"key":"1","label":"Participant name"},
  {"key":"2","label":"Early price"},
  {"key":"3","label":"Payment cutoff"},
  {"key":"4","label":"Late price"},
  {"key":"5","label":"STC Pay"},
  {"key":"6","label":"Bank"},
  {"key":"7","label":"IBAN"}
]'::jsonb,
updated_at = now()
where template_key = 'payment';
