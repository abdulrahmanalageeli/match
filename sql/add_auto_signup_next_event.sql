-- Add auto_signup_next_event column to participants table
-- This column allows participants to opt-in to automatic signup for all future events

ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS auto_signup_next_event boolean NOT NULL DEFAULT false;

-- Add comment to explain the column
COMMENT ON COLUMN public.participants.auto_signup_next_event IS 'When true, participant will be automatically signed up for all future events without needing to manually register each time';

-- Create index for efficient querying of auto-signup participants
CREATE INDEX IF NOT EXISTS idx_participants_auto_signup 
ON public.participants(auto_signup_next_event) 
WHERE auto_signup_next_event = true;

-- Add constraint to ensure the column is not null
ALTER TABLE public.participants 
ADD CONSTRAINT check_auto_signup_not_null 
CHECK (auto_signup_next_event IS NOT NULL);
