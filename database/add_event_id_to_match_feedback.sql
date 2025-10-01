-- Add event_id column to match_feedback table
-- This associates feedback with specific events to prevent cross-event data issues

-- Add the event_id column
ALTER TABLE public.match_feedback 
ADD COLUMN IF NOT EXISTS event_id INTEGER NULL DEFAULT 1;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.match_feedback.event_id IS 'Associates feedback with specific event to prevent cross-event data contamination';

-- Create index for efficient querying by event_id
CREATE INDEX IF NOT EXISTS idx_match_feedback_event_id 
ON public.match_feedback USING btree (event_id) 
TABLESPACE pg_default;

-- Create composite index for common query pattern (event + participant + round)
CREATE INDEX IF NOT EXISTS idx_match_feedback_event_participant_round 
ON public.match_feedback USING btree (event_id, participant_number, round) 
TABLESPACE pg_default;

-- Update the unique constraint to include event_id
-- First, drop the old constraint
ALTER TABLE public.match_feedback 
DROP CONSTRAINT IF EXISTS match_feedback_match_id_participant_number_round_key;

-- Add new unique constraint including event_id
ALTER TABLE public.match_feedback 
ADD CONSTRAINT match_feedback_match_id_participant_number_round_event_key 
UNIQUE (match_id, participant_number, round, event_id);

-- Optional: Backfill existing records with event_id = 1 (if any exist)
-- UPDATE public.match_feedback 
-- SET event_id = 1 
-- WHERE event_id IS NULL;

-- Optional: Make event_id NOT NULL after backfill
-- ALTER TABLE public.match_feedback 
-- ALTER COLUMN event_id SET NOT NULL;
