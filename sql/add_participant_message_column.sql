-- Add participant message column to match_feedback table
-- This allows participants to send optional messages to their conversation partners

ALTER TABLE public.match_feedback 
ADD COLUMN participant_message TEXT NULL;

-- Add comment to document the purpose of the column
COMMENT ON COLUMN public.match_feedback.participant_message IS 'Optional message from participant to their conversation partner. Will be displayed with spoiler protection in results.';

-- Create index for efficient querying of messages
CREATE INDEX IF NOT EXISTS idx_match_feedback_has_message 
ON public.match_feedback USING btree (participant_number, round, event_id) 
WHERE participant_message IS NOT NULL;

-- Add constraint to limit message length (optional - adjust as needed)
ALTER TABLE public.match_feedback 
ADD CONSTRAINT participant_message_length_check 
CHECK (LENGTH(participant_message) <= 500);

-- Update table comment to reflect new functionality
COMMENT ON TABLE public.match_feedback IS 'Stores feedback from participants about their matches, including optional messages to conversation partners';
