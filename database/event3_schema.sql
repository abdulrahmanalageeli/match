-- =============================================================
-- Event 3.0 Database Schema (التوافق الأعمى 3.0)
-- Run this in Supabase SQL editor before using the new event
-- =============================================================

-- جدول المشاركين المختارين للفعالية 3.0
-- Stores the 36 selected participants and their grid positions
CREATE TABLE IF NOT EXISTS public.event3_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  participant_number integer NOT NULL REFERENCES public.participants(assigned_number),
  position integer NOT NULL, -- 0-35, defines grid slot for seating plan
  created_at timestamptz DEFAULT now(),
  CONSTRAINT event3_participants_match_participant_unique UNIQUE (match_id, participant_number),
  CONSTRAINT event3_participants_match_position_unique UNIQUE (match_id, position),
  CONSTRAINT event3_participants_position_range CHECK (position >= 0)
);

-- جدول نتائج المطابقة الفردية
-- Stores Phase 2 (ranking-based) and Phase 3 (algorithm-based) match results
CREATE TABLE IF NOT EXISTS public.event3_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  participant_number integer NOT NULL REFERENCES public.participants(assigned_number),
  phase2_partner integer REFERENCES public.participants(assigned_number),
  phase3_partner integer REFERENCES public.participants(assigned_number),
  phase2_word text,   -- one word typed after Phase 2 meeting
  phase3_word text,   -- one word typed after Phase 3 meeting (optional)
  phase3_score integer, -- compatibility % for Phase 3 (0-100)
  phase2_score integer, -- compatibility % for Phase 2 (0-100)
  phase2_feedback jsonb,  -- full feedback form after Phase 2 session
  phase3_feedback jsonb,  -- full feedback form after Phase 3 session
  created_at timestamptz DEFAULT now(),
  CONSTRAINT event3_matches_match_participant_unique UNIQUE (match_id, participant_number)
);

-- Migration: add feedback columns if table already exists
-- ALTER TABLE public.event3_matches ADD COLUMN IF NOT EXISTS phase2_feedback jsonb;
-- ALTER TABLE public.event3_matches ADD COLUMN IF NOT EXISTS phase3_feedback jsonb;
-- ALTER TABLE public.event3_matches ADD COLUMN IF NOT EXISTS phase2_score integer;

-- If table already exists with old constraint, run this to fix it:
-- ALTER TABLE public.event3_participants DROP CONSTRAINT IF EXISTS event3_participants_position_range;
-- ALTER TABLE public.event3_participants ADD CONSTRAINT event3_participants_position_range CHECK (position >= 0);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event3_participants_match ON public.event3_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_event3_participants_number ON public.event3_participants(participant_number);
CREATE INDEX IF NOT EXISTS idx_event3_matches_match ON public.event3_matches(match_id);
CREATE INDEX IF NOT EXISTS idx_event3_matches_participant ON public.event3_matches(participant_number);
CREATE INDEX IF NOT EXISTS idx_session_assignments_match_round ON public.session_assignments(match_id, round);
CREATE INDEX IF NOT EXISTS idx_participant_rankings_match_ranker ON public.participant_rankings(match_id, ranker_number);

-- جدول توزيع الجلسات (إذا لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS public.session_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  event_id integer NOT NULL DEFAULT 3,
  round integer NOT NULL,         -- 1, 2, or 3
  table_number integer NOT NULL,  -- 1-6
  participant_id integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- جدول تصنيفات المشاركين (إذا لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS public.participant_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  event_id integer NOT NULL DEFAULT 3,
  ranker_number integer NOT NULL,   -- who submitted the ranking
  ranked_number integer NOT NULL,   -- who is being ranked
  rank integer NOT NULL,            -- 1 = top choice, 15 = bottom
  created_at timestamptz DEFAULT now(),
  CONSTRAINT participant_rankings_unique UNIQUE (match_id, ranker_number, ranked_number)
);

-- جدول فحص المزاج اللحظي
-- Admin triggers a mood check; participants respond with happy/neutral/not_great
CREATE TABLE IF NOT EXISTS public.event3_mood_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  check_id text NOT NULL,          -- shared ID grouping one admin trigger (uuid string)
  participant_number integer NOT NULL,
  mood text,                        -- 'happy' | 'neutral' | 'not_great' (null until answered)
  triggered_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  CONSTRAINT event3_mood_checks_unique UNIQUE (match_id, check_id, participant_number)
);

CREATE INDEX IF NOT EXISTS idx_event3_mood_checks_match ON public.event3_mood_checks(match_id);
CREATE INDEX IF NOT EXISTS idx_event3_mood_checks_check ON public.event3_mood_checks(check_id);
CREATE INDEX IF NOT EXISTS idx_event3_mood_checks_participant ON public.event3_mood_checks(participant_number);
