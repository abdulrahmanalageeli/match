alter table public.survey_progress_presence
  add column if not exists age smallint,
  add column if not exists age_revealed boolean not null default false;

alter table public.survey_progress_presence
  drop constraint if exists survey_progress_presence_age_valid,
  add constraint survey_progress_presence_age_valid
    check (age is null or age between 18 and 65),
  drop constraint if exists survey_progress_presence_age_privacy,
  add constraint survey_progress_presence_age_privacy
    check (age_revealed = false or age is not null);

comment on column public.survey_progress_presence.age is
  'Participant age, retained only after the personal-details survey page was completed.';

comment on column public.survey_progress_presence.age_revealed is
  'True only after age passed validation and the participant advanced beyond its survey page.';

revoke all on table public.survey_progress_presence from anon, authenticated;
grant select, insert, update, delete on table public.survey_progress_presence to service_role;
