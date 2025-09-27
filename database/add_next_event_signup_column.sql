-- Add column to track participants who want to sign up for next event
ALTER TABLE public.participants 
ADD COLUMN signup_for_next_event boolean DEFAULT false;

-- Add index for better performance when querying next event signups
CREATE INDEX idx_participants_next_event_signup ON public.participants(signup_for_next_event) WHERE signup_for_next_event = true;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.participants.signup_for_next_event IS 'Indicates if participant wants to be automatically registered for the next event';

-- Optional: Add a timestamp column to track when they signed up for next event
ALTER TABLE public.participants 
ADD COLUMN next_event_signup_timestamp timestamp with time zone DEFAULT NULL;

COMMENT ON COLUMN public.participants.next_event_signup_timestamp IS 'Timestamp when participant requested signup for next event';
