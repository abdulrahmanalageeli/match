-- =============================================================
-- Event 3.0 Database Schema (التوافق الأعمى 3.0)
-- Canonical schema — reflects the actual current state of all
-- event3-related tables in Supabase.
--
-- Migration scripts (event3_add_event_id.sql, alter_event3_phase2_exclusion.sql,
-- event3_add_match_preference.sql, event3_add_test_mode.sql, etc.) exist for
-- applying incremental changes to an already-provisioned database.
-- This file is the source of truth for what the schema looks like
-- after all migrations have been applied.
-- =============================================================

-- =============================================================
-- event3_participants
-- Stores the 36 selected participants and their grid positions
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  participant_number integer NOT NULL,
  position integer NOT NULL,          -- 0-35, defines grid slot for seating plan
  created_at timestamptz DEFAULT now(),
  phase2_excluded boolean DEFAULT false,  -- excludes from choice-based round (phase2)
  event_id integer DEFAULT 20,
  CONSTRAINT event3_participants_match_event_participant_unique UNIQUE (match_id, event_id, participant_number),
  CONSTRAINT event3_participants_match_event_position_unique UNIQUE (match_id, event_id, position),
  CONSTRAINT event3_participants_position_range CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS idx_event3_participants_match ON public.event3_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_event3_participants_number ON public.event3_participants(participant_number);
CREATE INDEX IF NOT EXISTS idx_event3_participants_event ON public.event3_participants(match_id, event_id);

-- =============================================================
-- event3_matches
-- Stores Phase 2 (ranking-based) and Phase 3 (algorithm-based) match results
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  participant_number integer NOT NULL,
  phase2_partner integer,
  phase3_partner integer,
  phase2_word text,                   -- one word typed after Phase 2 meeting
  phase3_word text,                   -- one word typed after Phase 3 meeting (optional)
  phase3_score integer,               -- compatibility % for Phase 3 (0-100)
  phase2_score integer,               -- compatibility % for Phase 2 (0-100)
  phase2_feedback jsonb,              -- full feedback form after Phase 2 session
  phase3_feedback jsonb,              -- full feedback form after Phase 3 session
  match_preference text,              -- 'choice' | 'algorithm' | 'both' | 'neither'
  created_at timestamptz DEFAULT now(),
  event_id integer DEFAULT 20,
  CONSTRAINT event3_matches_match_event_participant_unique UNIQUE (match_id, event_id, participant_number),
  CONSTRAINT event3_matches_match_preference_check CHECK (match_preference IN ('choice', 'algorithm', 'both', 'neither'))
);

CREATE INDEX IF NOT EXISTS idx_event3_matches_match ON public.event3_matches(match_id);
CREATE INDEX IF NOT EXISTS idx_event3_matches_participant ON public.event3_matches(participant_number);
CREATE INDEX IF NOT EXISTS idx_event3_matches_event ON public.event3_matches(match_id, event_id);

-- =============================================================
-- event3_participant_notes
-- Stores notes a participant writes about another participant
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_participant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  participant_number integer NOT NULL,  -- who wrote the note
  about_number integer,                 -- who the note is about
  phase integer,                        -- null = general, 2 = phase2, 3 = phase3
  note text NOT NULL,
  created_at timestamptz DEFAULT now(),
  event_id integer DEFAULT 20
);

CREATE INDEX IF NOT EXISTS idx_event3_notes_match_event ON public.event3_participant_notes(match_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event3_notes_participant ON public.event3_participant_notes(participant_number);

-- =============================================================
-- event3_exclusions
-- Conflict-of-interest / do-not-match pairs for event3
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_exclusions (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  event_id INTEGER NOT NULL DEFAULT 1,
  participant_a_number INTEGER NOT NULL,
  participant_b_number INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (match_id, event_id, participant_a_number, participant_b_number)
);

CREATE INDEX IF NOT EXISTS idx_event3_exclusions_match_event ON public.event3_exclusions(match_id, event_id);

-- =============================================================
-- event3_mood_checks
-- Admin triggers a mood check; participants respond with happy/neutral/not_great
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_mood_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  check_id text NOT NULL,              -- shared ID grouping one admin trigger (uuid string)
  participant_number integer NOT NULL,
  mood text,                           -- 'happy' | 'neutral' | 'not_great' (null until answered)
  triggered_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  event_id integer DEFAULT 20,
  CONSTRAINT event3_mood_checks_unique UNIQUE (match_id, check_id, participant_number)
);

CREATE INDEX IF NOT EXISTS idx_event3_mood_checks_match ON public.event3_mood_checks(match_id);
CREATE INDEX IF NOT EXISTS idx_event3_mood_checks_check ON public.event3_mood_checks(check_id);
CREATE INDEX IF NOT EXISTS idx_event3_mood_checks_participant ON public.event3_mood_checks(participant_number);
CREATE INDEX IF NOT EXISTS idx_event3_mood_checks_event ON public.event3_mood_checks(match_id, event_id);

-- =============================================================
-- event3_notifications
-- Admin sends informational notifications to participants (no response needed)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  notif_id text NOT NULL,              -- shared ID grouping one admin send (uuid string)
  participant_number integer NOT NULL,
  title text NOT NULL,
  body text,
  icon text DEFAULT 'info',            -- 'info' | 'heart' | 'clock' | 'star' | 'alert'
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  event_id integer DEFAULT 20,
  CONSTRAINT event3_notifications_unique UNIQUE (match_id, notif_id, participant_number)
);

CREATE INDEX IF NOT EXISTS idx_event3_notifications_match ON public.event3_notifications(match_id);
CREATE INDEX IF NOT EXISTS idx_event3_notifications_notif ON public.event3_notifications(notif_id);
CREATE INDEX IF NOT EXISTS idx_event3_notifications_participant ON public.event3_notifications(participant_number);
CREATE INDEX IF NOT EXISTS idx_event3_notifications_event ON public.event3_notifications(match_id, event_id);

-- =============================================================
-- event3_ai_welcome_messages
-- AI-generated personalized welcome messages per participant
-- (previously stored in participants.survey_data._ai_welcome)
-- Schema file: event3_ai_welcome_messages.sql
-- Migration script: migrate_ai_welcome_messages.sql
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_ai_welcome_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  event_id integer NOT NULL DEFAULT 20,
  participant_number integer NOT NULL,
  welcome_message text NOT NULL,
  generated_at timestamptz DEFAULT now(),
  generated_by text DEFAULT 'system',
  CONSTRAINT e3_welcome_unique UNIQUE (match_id, event_id, participant_number)
);

CREATE INDEX IF NOT EXISTS idx_e3_welcome_match_event ON public.event3_ai_welcome_messages(match_id, event_id);
CREATE INDEX IF NOT EXISTS idx_e3_welcome_participant ON public.event3_ai_welcome_messages(participant_number);

-- =============================================================
-- event_attendance
-- Tracks whether a participant attended a specific event
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  event_id integer NOT NULL,
  participant_number integer NOT NULL,
  attended boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT event_attendance_unique UNIQUE (match_id, event_id, participant_number)
);

CREATE INDEX IF NOT EXISTS idx_event_attendance_match_event ON public.event_attendance(match_id, event_id);

-- =============================================================
-- session_assignments
-- Round/table seating assignments (social golfer problem)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.session_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  event_id integer NOT NULL DEFAULT 1,
  round integer NOT NULL,             -- 1, 2, or 3
  table_number integer NOT NULL,      -- 1-6
  participant_id integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_assignments_match_round ON public.session_assignments(match_id, round);

-- =============================================================
-- participant_rankings
-- Ranking submissions (who ranked whom, what rank)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.participant_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  event_id integer NOT NULL DEFAULT 1,
  ranker_number integer NOT NULL,     -- who submitted the ranking
  ranked_number integer NOT NULL,     -- who is being ranked
  rank integer NOT NULL,              -- 1 = top choice
  submitted_at timestamptz DEFAULT now(),
  auto_saved boolean NOT NULL DEFAULT false,  -- true if saved by timer auto-save
  CONSTRAINT participant_rankings_unique UNIQUE (match_id, ranker_number, ranked_number)
);

CREATE INDEX IF NOT EXISTS idx_participant_rankings_match_ranker ON public.participant_rankings(match_id, ranker_number);

-- =============================================================
-- organizer_requests
-- SOS / chat requests from participants to organizer
-- =============================================================
CREATE TABLE IF NOT EXISTS public.organizer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_token text NOT NULL,
  participant_number integer,
  participant_name text,
  table_info text,
  message text,
  organizer_reply text,
  status text DEFAULT 'pending',
  request_type text DEFAULT 'chat',
  chat_history jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizer_requests_token ON public.organizer_requests(participant_token);
CREATE INDEX IF NOT EXISTS idx_organizer_requests_status ON public.organizer_requests(status);
CREATE INDEX IF NOT EXISTS idx_organizer_requests_type ON public.organizer_requests(request_type);
