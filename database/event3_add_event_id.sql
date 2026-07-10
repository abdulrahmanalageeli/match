-- =============================================================
-- Migration: Add event_id scoping to Event 3 tables
-- This allows multiple events (20, 21, 22...) to coexist without data loss
-- Run this in Supabase SQL editor
-- =============================================================

-- 1. Add current_event_id to event_state (for EVENT3_MATCH_ID row)
DO $$ BEGIN
  ALTER TABLE public.event_state ADD COLUMN IF NOT EXISTS current_event_id integer DEFAULT 20;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Set the EVENT3 row to current event 20 if not set
UPDATE public.event_state
SET current_event_id = 20
WHERE match_id = '00000000-0000-0000-0000-000000000003'
  AND (current_event_id IS NULL OR current_event_id = 0);

-- 2. Add event_id to event3_participants
DO $$ BEGIN
  ALTER TABLE public.event3_participants ADD COLUMN IF NOT EXISTS event_id integer DEFAULT 20;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Backfill existing rows with event_id = 20
UPDATE public.event3_participants
SET event_id = 20
WHERE event_id IS NULL OR event_id = 0;

-- Drop old unique constraints and recreate with event_id included
ALTER TABLE public.event3_participants DROP CONSTRAINT IF EXISTS event3_participants_match_participant_unique;
ALTER TABLE public.event3_participants ADD CONSTRAINT event3_participants_match_event_participant_unique UNIQUE (match_id, event_id, participant_number);

ALTER TABLE public.event3_participants DROP CONSTRAINT IF EXISTS event3_participants_match_position_unique;
ALTER TABLE public.event3_participants ADD CONSTRAINT event3_participants_match_event_position_unique UNIQUE (match_id, event_id, position);

-- 3. Add event_id to event3_matches
DO $$ BEGIN
  ALTER TABLE public.event3_matches ADD COLUMN IF NOT EXISTS event_id integer DEFAULT 20;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Backfill existing rows
UPDATE public.event3_matches
SET event_id = 20
WHERE event_id IS NULL OR event_id = 0;

-- Drop old unique constraint and recreate with event_id
ALTER TABLE public.event3_matches DROP CONSTRAINT IF EXISTS event3_matches_match_participant_unique;
ALTER TABLE public.event3_matches ADD CONSTRAINT event3_matches_match_event_participant_unique UNIQUE (match_id, event_id, participant_number);

-- 4. Add event_id to event3_mood_checks
DO $$ BEGIN
  ALTER TABLE public.event3_mood_checks ADD COLUMN IF NOT EXISTS event_id integer DEFAULT 20;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

UPDATE public.event3_mood_checks
SET event_id = 20
WHERE event_id IS NULL OR event_id = 0;

-- 5. Add event_id to event3_notifications
DO $$ BEGIN
  ALTER TABLE public.event3_notifications ADD COLUMN IF NOT EXISTS event_id integer DEFAULT 20;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

UPDATE public.event3_notifications
SET event_id = 20
WHERE event_id IS NULL OR event_id = 0;

-- 6. Add event_id to event3_participant_notes (if table exists)
DO $$ BEGIN
  ALTER TABLE public.event3_participant_notes ADD COLUMN IF NOT EXISTS event_id integer DEFAULT 20;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7. Add indexes for event_id filtering
CREATE INDEX IF NOT EXISTS idx_event3_participants_event ON public.event3_participants(match_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event3_matches_event ON public.event3_matches(match_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event3_mood_checks_event ON public.event3_mood_checks(match_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event3_notifications_event ON public.event3_notifications(match_id, event_id);

-- 8. Also update session_assignments default event_id to 20 for Event 3 rows
UPDATE public.session_assignments
SET event_id = 20
WHERE match_id = '00000000-0000-0000-0000-000000000003'
  AND (event_id IS NULL OR event_id = 3);

-- 9. Also update participant_rankings for Event 3
UPDATE public.participant_rankings
SET event_id = 20
WHERE match_id = '00000000-0000-0000-0000-000000000003'
  AND (event_id IS NULL OR event_id = 3);
