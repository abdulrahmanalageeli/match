-- Create excluded_participants table for storing admin-defined participants who should not be matched with anyone
CREATE TABLE excluded_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  participant_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin',
  reason TEXT DEFAULT 'Admin exclusion - participant excluded from all matching',
  
  -- Ensure participant exists and is not the organizer
  CONSTRAINT excluded_participants_valid_number CHECK (participant_number > 0 AND participant_number != 9999)
);

-- Create index for faster lookups
CREATE INDEX idx_excluded_participants_match_id ON excluded_participants(match_id);
CREATE INDEX idx_excluded_participants_number ON excluded_participants(participant_number);

-- Create a unique index to prevent duplicate exclusions for the same participant in the same event
CREATE UNIQUE INDEX idx_excluded_participants_unique 
ON excluded_participants(match_id, participant_number);

-- Add comments for documentation
COMMENT ON TABLE excluded_participants IS 'Stores admin-defined participants who should not be matched with anyone';
COMMENT ON COLUMN excluded_participants.match_id IS 'References the match/event ID';
COMMENT ON COLUMN excluded_participants.participant_number IS 'Participant assigned number to exclude from all matching';
COMMENT ON COLUMN excluded_participants.reason IS 'Optional reason for exclusion';
COMMENT ON INDEX idx_excluded_participants_unique IS 'Prevents duplicate exclusions for the same participant in the same event';
