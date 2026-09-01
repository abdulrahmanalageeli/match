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
-- event3_event_settings
-- Per-edition flow switch. Missing rows are interpreted as classic by the API.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_event_settings (
  match_id uuid NOT NULL,
  event_id integer NOT NULL,
  event_format text NOT NULL DEFAULT 'classic',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, event_id),
  CONSTRAINT event3_event_settings_format CHECK (
    event_format IN ('classic', 'choice_only_three_groups')
  )
);

ALTER TABLE public.event3_event_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event3_event_settings FROM public, anon, authenticated;
GRANT ALL ON public.event3_event_settings TO service_role;
CREATE POLICY event3_event_settings_service_only ON public.event3_event_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================
-- event3_participants
-- Stores selected participants and their grid positions (36 classic, 42 choice-only)
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
-- Stores three one-to-one match slots. Classic uses choice + algorithm;
-- choice_only_three_groups uses first choice + second choice + third choice.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  participant_number integer NOT NULL,
  phase2_partner integer,
  phase3_partner integer,
  phase4_partner integer,
  phase2_word text,                   -- one word typed after Phase 2 meeting
  phase3_word text,                   -- one word typed after Phase 3 meeting (optional)
  phase4_word text,                   -- one word typed after Phase 4 meeting (optional)
  phase3_score integer,               -- compatibility % for Phase 3 (0-100)
  phase2_score integer,               -- compatibility % for Phase 2 (0-100)
  phase4_score integer,               -- compatibility metadata only; choice order decides the match
  phase2_feedback jsonb,              -- full feedback form after Phase 2 session
  phase3_feedback jsonb,              -- full feedback form after Phase 3 session
  phase4_feedback jsonb,              -- full feedback form after Phase 4 session
  match_preference text,              -- classic values or first/second/third/multiple/none
  phase2_score_model_version text,
  phase2_score_snapshot jsonb,
  phase2_score_content_hash text,
  phase3_score_model_version text,
  phase3_score_snapshot jsonb,
  phase3_score_content_hash text,
  phase4_score_model_version text,
  phase4_score_snapshot jsonb,
  phase4_score_content_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  event_id integer DEFAULT 20,
  CONSTRAINT event3_matches_match_event_participant_unique UNIQUE (match_id, event_id, participant_number),
  CONSTRAINT event3_matches_match_preference_check CHECK (match_preference IN (
    'choice', 'algorithm', 'both', 'neither',
    'first', 'second', 'third', 'multiple', 'none'
  )),
  CONSTRAINT event3_matches_phase2_score_snapshot_object CHECK (
    phase2_score_snapshot IS NULL OR jsonb_typeof(phase2_score_snapshot) = 'object'
  ),
  CONSTRAINT event3_matches_phase3_score_snapshot_object CHECK (
    phase3_score_snapshot IS NULL OR jsonb_typeof(phase3_score_snapshot) = 'object'
  ),
  CONSTRAINT event3_matches_phase4_score_snapshot_object CHECK (
    phase4_score_snapshot IS NULL OR jsonb_typeof(phase4_score_snapshot) = 'object'
  ),
  CONSTRAINT event3_matches_phase2_score_provenance_complete CHECK (
    CASE
      WHEN phase2_score_model_version IS NULL AND phase2_score_snapshot IS NULL AND phase2_score_content_hash IS NULL
        THEN true
      WHEN phase2_score_model_version IS NOT NULL AND phase2_score_snapshot IS NOT NULL AND phase2_score_content_hash IS NOT NULL
        THEN coalesce(phase2_score_snapshot ->> 'scoreModelVersion' = phase2_score_model_version
          AND phase2_score_snapshot ->> 'combinedContentHash' = phase2_score_content_hash
          AND jsonb_typeof(phase2_score_snapshot -> 'scoreBreakdown') = 'object'
          AND jsonb_typeof(phase2_score_snapshot -> 'questionScores') = 'object'
          AND jsonb_typeof(phase2_score_snapshot -> 'vibeAxes') = 'object'
          AND phase2_score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
          AND phase2_score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
          AND phase2_score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
          AND CASE
            WHEN phase2_score IS NOT NULL AND jsonb_typeof(phase2_score_snapshot -> 'totalScore') = 'number'
              THEN (phase2_score_snapshot ->> 'totalScore')::numeric = phase2_score::numeric
            ELSE false
          END, false)
      ELSE false
    END
  ),
  CONSTRAINT event3_matches_phase3_score_provenance_complete CHECK (
    CASE
      WHEN phase3_score_model_version IS NULL AND phase3_score_snapshot IS NULL AND phase3_score_content_hash IS NULL
        THEN true
      WHEN phase3_score_model_version IS NOT NULL AND phase3_score_snapshot IS NOT NULL AND phase3_score_content_hash IS NOT NULL
        THEN coalesce(phase3_score_snapshot ->> 'scoreModelVersion' = phase3_score_model_version
          AND phase3_score_snapshot ->> 'combinedContentHash' = phase3_score_content_hash
          AND jsonb_typeof(phase3_score_snapshot -> 'scoreBreakdown') = 'object'
          AND jsonb_typeof(phase3_score_snapshot -> 'questionScores') = 'object'
          AND jsonb_typeof(phase3_score_snapshot -> 'vibeAxes') = 'object'
          AND phase3_score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
          AND phase3_score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
          AND phase3_score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
          AND CASE
            WHEN phase3_score IS NOT NULL AND jsonb_typeof(phase3_score_snapshot -> 'totalScore') = 'number'
              THEN (phase3_score_snapshot ->> 'totalScore')::numeric = phase3_score::numeric
            ELSE false
          END, false)
      ELSE false
    END
  ),
  CONSTRAINT event3_matches_phase4_score_provenance_complete CHECK (
    CASE
      WHEN phase4_score_model_version IS NULL AND phase4_score_snapshot IS NULL AND phase4_score_content_hash IS NULL
        THEN true
      WHEN phase4_score_model_version IS NOT NULL AND phase4_score_snapshot IS NOT NULL AND phase4_score_content_hash IS NOT NULL
        THEN coalesce(phase4_score_snapshot ->> 'scoreModelVersion' = phase4_score_model_version
          AND phase4_score_snapshot ->> 'combinedContentHash' = phase4_score_content_hash
          AND jsonb_typeof(phase4_score_snapshot -> 'scoreBreakdown') = 'object'
          AND jsonb_typeof(phase4_score_snapshot -> 'questionScores') = 'object'
          AND jsonb_typeof(phase4_score_snapshot -> 'vibeAxes') = 'object'
          AND phase4_score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
          AND phase4_score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
          AND phase4_score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
          AND CASE
            WHEN phase4_score IS NOT NULL AND jsonb_typeof(phase4_score_snapshot -> 'totalScore') = 'number'
              THEN (phase4_score_snapshot ->> 'totalScore')::numeric = phase4_score::numeric
            ELSE false
          END, false)
      ELSE false
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_event3_matches_match ON public.event3_matches(match_id);
CREATE INDEX IF NOT EXISTS idx_event3_matches_participant ON public.event3_matches(participant_number);
CREATE INDEX IF NOT EXISTS idx_event3_matches_event ON public.event3_matches(match_id, event_id);

-- =============================================================
-- event3_test_match_results
-- Isolated temporary Phase 3 results while organizer test mode is active
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_test_match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000003'::uuid,
  event_id integer NOT NULL CHECK (event_id > 0),
  participant_a_number integer NOT NULL CHECK (participant_a_number > 0),
  participant_b_number integer NOT NULL CHECK (participant_b_number > 0),
  compatibility_score numeric NOT NULL DEFAULT 0,
  round smallint NOT NULL DEFAULT 30,
  table_number integer,
  match_type text NOT NULL DEFAULT 'individual',
  reason text,
  mbti_compatibility_score numeric NOT NULL DEFAULT 0,
  attachment_compatibility_score numeric NOT NULL DEFAULT 0,
  communication_compatibility_score numeric NOT NULL DEFAULT 0,
  lifestyle_compatibility_score numeric NOT NULL DEFAULT 0,
  core_values_compatibility_score numeric NOT NULL DEFAULT 0,
  vibe_compatibility_score numeric NOT NULL DEFAULT 0,
  synergy_score numeric NOT NULL DEFAULT 0,
  humor_open_score numeric NOT NULL DEFAULT 0,
  intent_score numeric NOT NULL DEFAULT 0,
  humor_multiplier numeric NOT NULL DEFAULT 1,
  attachment_penalty_applied boolean NOT NULL DEFAULT false,
  intent_boost_applied boolean NOT NULL DEFAULT false,
  dead_air_veto_applied boolean NOT NULL DEFAULT false,
  humor_clash_veto_applied boolean NOT NULL DEFAULT false,
  cap_applied numeric,
  humor_early_openness_bonus text NOT NULL DEFAULT 'none',
  score_model_version text,
  score_snapshot jsonb,
  score_content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event3_test_match_results_canonical_pair CHECK (participant_a_number < participant_b_number),
  CONSTRAINT event3_test_match_results_round CHECK (round = 30),
  CONSTRAINT event3_test_match_results_match_type CHECK (match_type = 'individual'),
  CONSTRAINT event3_test_match_results_score_snapshot_object CHECK (
    score_snapshot IS NULL OR jsonb_typeof(score_snapshot) = 'object'
  ),
  CONSTRAINT event3_test_match_results_score_provenance_complete CHECK (
    CASE
      WHEN score_model_version IS NULL AND score_snapshot IS NULL AND score_content_hash IS NULL
        THEN true
      WHEN score_model_version IS NOT NULL AND score_snapshot IS NOT NULL AND score_content_hash IS NOT NULL
        THEN coalesce(score_snapshot ->> 'scoreModelVersion' = score_model_version
          AND score_snapshot ->> 'combinedContentHash' = score_content_hash
          AND jsonb_typeof(score_snapshot -> 'scoreBreakdown') = 'object'
          AND jsonb_typeof(score_snapshot -> 'questionScores') = 'object'
          AND jsonb_typeof(score_snapshot -> 'vibeAxes') = 'object'
          AND score_snapshot ->> 'vibeModel' = 'gpt-5.4-mini'
          AND score_snapshot ->> 'vibeModelVersion' = 'balanced-vibe12-v1'
          AND score_snapshot ->> 'vibeModelTag' = 'gpt-5.4-mini|balanced-vibe12-v1'
          AND CASE
            WHEN jsonb_typeof(score_snapshot -> 'totalScore') = 'number'
              THEN (score_snapshot ->> 'totalScore')::numeric = compatibility_score
            ELSE false
          END, false)
      ELSE false
    END
  ),
  CONSTRAINT event3_test_match_results_unique_pair UNIQUE (
    match_id, event_id, round, participant_a_number, participant_b_number
  )
);

CREATE INDEX IF NOT EXISTS event3_test_match_results_event_a_idx
  ON public.event3_test_match_results(match_id, event_id, participant_a_number);
CREATE INDEX IF NOT EXISTS event3_test_match_results_event_b_idx
  ON public.event3_test_match_results(match_id, event_id, participant_b_number);

ALTER TABLE public.event3_test_match_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event3_test_match_results FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event3_test_match_results TO service_role;

-- =============================================================
-- event3_cohost_notes
-- Private operational notes, including all three one-to-one rounds.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event3_cohost_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  event_id integer NOT NULL CHECK (event_id > 0),
  test_mode boolean NOT NULL DEFAULT false,
  test_session_key text NOT NULL DEFAULT '',
  scope_type text NOT NULL CHECK (scope_type IN ('event', 'table', 'participant', 'pair')),
  scope_key text NOT NULL CHECK (char_length(scope_key) BETWEEN 3 AND 120),
  round smallint CONSTRAINT event3_cohost_notes_round_check CHECK (round IN (1, 2, 3, 20, 30, 40)),
  table_number integer CHECK (table_number > 0),
  participant_number integer CHECK (participant_number > 0),
  participant2_number integer CHECK (participant2_number > 0),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  updated_by text NOT NULL DEFAULT 'event3-cohost',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event3_cohost_notes_scope_unique UNIQUE (
    match_id, event_id, test_mode, test_session_key, scope_key
  ),
  CONSTRAINT event3_cohost_notes_scope_shape CHECK (
    (
      scope_type = 'event'
      AND round IS NULL
      AND table_number IS NULL
      AND participant_number IS NULL
      AND participant2_number IS NULL
    )
    OR (
      scope_type = 'table'
      AND round IS NOT NULL
      AND table_number IS NOT NULL
      AND participant_number IS NULL
      AND participant2_number IS NULL
    )
    OR (
      scope_type = 'participant'
      AND round IS NULL
      AND table_number IS NULL
      AND participant_number IS NOT NULL
      AND participant2_number IS NULL
    )
    OR (
      scope_type = 'pair'
      AND round IN (20, 30, 40)
      AND table_number IS NULL
      AND participant_number IS NOT NULL
      AND participant2_number IS NOT NULL
      AND participant_number < participant2_number
    )
  )
);

CREATE INDEX IF NOT EXISTS event3_cohost_notes_event_updated_idx
  ON public.event3_cohost_notes (match_id, event_id, test_mode, test_session_key, updated_at DESC);

ALTER TABLE public.event3_cohost_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event3_cohost_notes FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event3_cohost_notes TO service_role;

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
  round integer NOT NULL,             -- group rounds 1-3; one-to-one rounds 20, 30, or 40
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
  CONSTRAINT participant_rankings_event_unique UNIQUE (match_id, event_id, ranker_number, ranked_number)
);

CREATE INDEX IF NOT EXISTS idx_participant_rankings_match_ranker ON public.participant_rankings(match_id, ranker_number);
CREATE INDEX IF NOT EXISTS idx_participant_rankings_match_event_ranker ON public.participant_rankings(match_id, event_id, ranker_number);

-- =============================================================
-- organizer_requests
-- SOS / chat requests from participants to organizer
-- =============================================================
CREATE TABLE IF NOT EXISTS public.organizer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id integer,
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
CREATE INDEX IF NOT EXISTS idx_organizer_requests_event_status ON public.organizer_requests(event_id, status, updated_at DESC);
