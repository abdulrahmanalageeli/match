create table public.match_feedback (
  id uuid not null default gen_random_uuid (),
  match_id uuid not null,
  participant_number integer not null,
  participant_token text null,
  round smallint not null,
  event_id integer not null default 1,
  compatibility_rate integer null,
  conversation_quality smallint null,
  personal_connection smallint null,
  shared_interests smallint null,
  comfort_level smallint null,
  communication_style smallint null,
  would_meet_again smallint null,
  overall_experience smallint null,
  recommendations text null,
  organizer_impression text null,
  participant_message text null,
  submitted_at timestamp with time zone null default now(),
  created_at timestamp with time zone null default now(),
  constraint match_feedback_pkey primary key (id),
  constraint check_match_feedback_event_id_positive check ((event_id > 0)),
  constraint check_match_feedback_round_non_negative check ((round >= 0))
) TABLESPACE pg_default;

create index IF not exists idx_match_feedback_match_id on public.match_feedback using btree (match_id) TABLESPACE pg_default;
create index IF not exists idx_match_feedback_event_id on public.match_feedback using btree (event_id) TABLESPACE pg_default;
create index IF not exists idx_match_feedback_participant_number on public.match_feedback using btree (participant_number) TABLESPACE pg_default;
create index IF not exists idx_match_feedback_participant_token on public.match_feedback using btree (participant_token) TABLESPACE pg_default;
create index IF not exists idx_match_feedback_round on public.match_feedback using btree (round) TABLESPACE pg_default;

create unique index IF not exists idx_match_feedback_unique_participant_round_event on public.match_feedback using btree (
  match_id,
  participant_number,
  round,
  event_id
) TABLESPACE pg_default;