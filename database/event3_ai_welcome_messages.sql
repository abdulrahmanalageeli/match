-- =============================================================
-- event3_ai_welcome_messages
-- AI-generated personalized welcome messages per participant.
-- Previously stored in participants.survey_data._ai_welcome JSONB.
--
-- To migrate existing data from survey_data, run:
--   migrate_ai_welcome_messages.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS public.event3_ai_welcome_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  event_id integer NOT NULL DEFAULT 20,
  participant_number integer NOT NULL,
  welcome_message text NOT NULL,
  generated_at timestamp with time zone DEFAULT now(),
  generated_by text DEFAULT 'system',
  CONSTRAINT event3_ai_welcome_messages_pkey PRIMARY KEY (id),
  CONSTRAINT e3_welcome_unique UNIQUE (match_id, event_id, participant_number)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_e3_welcome_match_event
  ON public.event3_ai_welcome_messages USING btree (match_id, event_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_e3_welcome_participant
  ON public.event3_ai_welcome_messages USING btree (participant_number) TABLESPACE pg_default;
