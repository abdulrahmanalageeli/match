-- =============================================================
-- Migration: Add phase2_excluded column to event3_participants
-- Allows excluding a participant from the choice-based round (phase2)
-- while keeping them in group rounds and algorithm round (phase3)
-- =============================================================

ALTER TABLE public.event3_participants
ADD COLUMN IF NOT EXISTS phase2_excluded boolean DEFAULT false;

-- =============================================================
-- Migration: Add event_id column to locked_matches
-- Allows filtering locked matches by event ID for phase3 algorithm round
-- =============================================================

ALTER TABLE public.locked_matches
ADD COLUMN IF NOT EXISTS event_id integer DEFAULT 1;

-- Backfill existing locked matches to event_id = 1 (default)
UPDATE public.locked_matches SET event_id = 1 WHERE event_id IS NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_locked_matches_event_id ON public.locked_matches(event_id);
