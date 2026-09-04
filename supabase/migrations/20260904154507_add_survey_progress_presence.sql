-- Ephemeral, server-only presence for participants who currently have the
-- survey open. Rows are retained only as the latest heartbeat state; admin
-- reads always apply a short last_seen_at expiry so abandoned tabs disappear.

create table if not exists public.survey_progress_presence (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  match_id uuid not null,
  event_id integer not null,
  assigned_number integer not null,
  session_id uuid not null,
  current_page smallint not null default 0,
  total_pages smallint not null default 1,
  answered_questions smallint not null default 0,
  total_questions smallint not null default 1,
  progress_percent smallint not null default 0,
  gender text,
  gender_revealed boolean not null default false,
  is_active boolean not null default true,
  started_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint survey_progress_presence_current_page_valid
    check (current_page between 0 and 30),
  constraint survey_progress_presence_total_pages_valid
    check (total_pages between 1 and 30),
  constraint survey_progress_presence_question_counts_valid
    check (
      total_questions between 1 and 200
      and answered_questions between 0 and total_questions
    ),
  constraint survey_progress_presence_percent_valid
    check (progress_percent between 0 and 100),
  constraint survey_progress_presence_gender_valid
    check (gender is null or gender in ('male', 'female')),
  constraint survey_progress_presence_gender_privacy
    check (not gender_revealed or gender is not null)
);

create index if not exists survey_progress_presence_active_seen_idx
  on public.survey_progress_presence (is_active, last_seen_at desc);

alter table public.survey_progress_presence enable row level security;

-- Participants and admins reach this table only through authenticated server
-- endpoints. No browser role can enumerate presence or gender information.
revoke all on table public.survey_progress_presence from public, anon, authenticated;
grant select, insert, update, delete on table public.survey_progress_presence to service_role;

create or replace function public.reset_survey_progress_session_started_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.session_id is distinct from old.session_id then
    new.started_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function public.reset_survey_progress_session_started_at() from public, anon, authenticated;
grant execute on function public.reset_survey_progress_session_started_at() to service_role;

drop trigger if exists survey_progress_presence_reset_started_at
  on public.survey_progress_presence;
create trigger survey_progress_presence_reset_started_at
before insert or update of session_id
on public.survey_progress_presence
for each row
execute function public.reset_survey_progress_session_started_at();

comment on table public.survey_progress_presence is
  'Server-only, short-lived survey page presence used by the admin live progress tracker.';
