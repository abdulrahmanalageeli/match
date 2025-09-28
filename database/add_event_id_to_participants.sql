-- Add event_id column to participants table
ALTER TABLE public.participants 
ADD COLUMN event_id integer NOT NULL DEFAULT 1;

-- Add constraint to ensure event_id is positive
ALTER TABLE public.participants 
ADD CONSTRAINT check_event_id_positive CHECK (event_id > 0);

-- Add index for efficient querying by event_id
CREATE INDEX IF NOT EXISTS idx_participants_event_id 
ON public.participants USING btree (event_id) TABLESPACE pg_default;

-- Add composite index for event_id and match_id combination
CREATE INDEX IF NOT EXISTS idx_participants_event_match 
ON public.participants USING btree (event_id, match_id) TABLESPACE pg_default;

-- Add composite index for event_id and assigned_number
CREATE INDEX IF NOT EXISTS idx_participants_event_number 
ON public.participants USING btree (event_id, assigned_number) TABLESPACE pg_default;

-- Update existing participants to have event_id = 1 (they are from the first event)
UPDATE public.participants SET event_id = 1 WHERE event_id IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN public.participants.event_id IS 'Event identifier - auto-increments for new events. All participants before announcing event 2 are event_id = 1';

-- Add current_event_id column to event_state table to track the current active event
ALTER TABLE public.event_state 
ADD COLUMN IF NOT EXISTS current_event_id integer DEFAULT 1;

-- Add constraint to ensure current_event_id is positive
ALTER TABLE public.event_state 
ADD CONSTRAINT IF NOT EXISTS check_current_event_id_positive CHECK (current_event_id > 0);

-- Add index for efficient querying by current_event_id
CREATE INDEX IF NOT EXISTS idx_event_state_current_event_id 
ON public.event_state USING btree (current_event_id) TABLESPACE pg_default;

-- Add comment to document the column
COMMENT ON COLUMN public.event_state.current_event_id IS 'Current active event ID for new participant registrations';
