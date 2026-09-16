alter table public.event3_event_settings
  add column if not exists results_release_at timestamptz;
comment on column public.event3_event_settings.results_release_at is
  'Optional exact contact/results release time for this edition; existing service-role-only RLS applies.';
