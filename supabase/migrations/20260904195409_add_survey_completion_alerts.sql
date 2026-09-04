alter table public.survey_progress_presence
  add column if not exists completed_at timestamptz;

comment on column public.survey_progress_presence.completed_at is
  'Successful survey-save timestamp used for a short-lived admin completion alert.';

revoke all on table public.survey_progress_presence from anon, authenticated;
grant select, insert, update, delete on table public.survey_progress_presence to service_role;
