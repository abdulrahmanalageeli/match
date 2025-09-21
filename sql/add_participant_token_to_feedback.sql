-- Add participant_token column to match_feedback table
ALTER TABLE public.match_feedback 
ADD COLUMN IF NOT EXISTS participant_token VARCHAR(255) NULL;

-- Create index for participant_token for better query performance
CREATE INDEX IF NOT EXISTS idx_match_feedback_participant_token 
ON public.match_feedback USING btree (participant_token) TABLESPACE pg_default;

-- Updated table structure with participant_token column:
/*
create table public.match_feedback (
  id serial not null,
  match_id uuid not null,
  participant_number integer not null,
  participant_token varchar(255) null,
  round integer not null,
  submitted_at timestamp with time zone null default now(),
  compatibility_rate integer null,
  conversation_quality integer null,
  personal_connection integer null,
  shared_interests integer null,
  comfort_level integer null,
  communication_style integer null,
  overall_experience integer null,
  recommendations text null,
  would_meet_again integer null,
  constraint match_feedback_pkey primary key (id),
  constraint match_feedback_match_id_participant_number_round_key unique (match_id, participant_number, round),
  constraint compatibility_rate_range check (
    (
      (compatibility_rate >= 0)
      and (compatibility_rate <= 100)
    )
  ),
  constraint conversation_quality_range check (
    (
      (conversation_quality >= 1)
      and (conversation_quality <= 5)
    )
  ),
  constraint overall_experience_range check (
    (
      (overall_experience >= 1)
      and (overall_experience <= 5)
    )
  ),
  constraint personal_connection_range check (
    (
      (personal_connection >= 1)
      and (personal_connection <= 5)
    )
  ),
  constraint shared_interests_range check (
    (
      (shared_interests >= 1)
      and (shared_interests <= 5)
    )
  ),
  constraint comfort_level_range check (
    (
      (comfort_level >= 1)
      and (comfort_level <= 5)
    )
  ),
  constraint would_meet_again_range check (
    (
      (would_meet_again >= 1)
      and (would_meet_again <= 5)
    )
  ),
  constraint communication_style_range check (
    (
      (communication_style >= 1)
      and (communication_style <= 5)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_match_feedback_match_id on public.match_feedback using btree (match_id) TABLESPACE pg_default;

create index IF not exists idx_match_feedback_participant on public.match_feedback using btree (participant_number) TABLESPACE pg_default;

create index IF not exists idx_match_feedback_participant_token on public.match_feedback using btree (participant_token) TABLESPACE pg_default;
*/
