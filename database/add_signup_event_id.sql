-- =============================================================
-- Migration: Add signup_event_id to participants
-- Tracks which event_id the participant was in when they clicked
-- "sign me up for next event"
-- =============================================================

ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS signup_event_id integer;

-- Backfill: for existing participants who have signup_for_next_event=true,
-- set signup_event_id to their current event_id (best approximation)
UPDATE public.participants
SET signup_event_id = event_id
WHERE signup_for_next_event = true AND signup_event_id IS NULL;
