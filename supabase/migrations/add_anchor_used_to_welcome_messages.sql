-- Add anchor_used column to event3_ai_welcome_messages
-- Tracks which survey anchor was used for each welcome message,
-- so returning participants get a different anchor next time.
ALTER TABLE event3_ai_welcome_messages
ADD COLUMN IF NOT EXISTS anchor_used TEXT;

-- Add comment for documentation
COMMENT ON COLUMN event3_ai_welcome_messages.anchor_used IS 'Comma-separated anchor keys used in this welcome message (e.g. "hobbies,weekend")';
