-- Create excluded_pairs table for storing admin-defined participant exclusions
CREATE TABLE excluded_pairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  participant1_number INTEGER NOT NULL,
  participant2_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin',
  reason TEXT DEFAULT 'Admin exclusion',
  
  -- Ensure we don't have duplicate pairs (bidirectional constraint)
  CONSTRAINT unique_excluded_pair UNIQUE (match_id, LEAST(participant1_number, participant2_number), GREATEST(participant1_number, participant2_number)),
  
  -- Ensure participant1 and participant2 are different
  CONSTRAINT different_participants CHECK (participant1_number != participant2_number)
);

-- Create index for faster lookups
CREATE INDEX idx_excluded_pairs_match_id ON excluded_pairs(match_id);
CREATE INDEX idx_excluded_pairs_participants ON excluded_pairs(participant1_number, participant2_number);

-- Add comments for documentation
COMMENT ON TABLE excluded_pairs IS 'Stores admin-defined participant pairs that should not be matched together';
COMMENT ON COLUMN excluded_pairs.match_id IS 'References the match/event ID';
COMMENT ON COLUMN excluded_pairs.participant1_number IS 'First participant assigned number';
COMMENT ON COLUMN excluded_pairs.participant2_number IS 'Second participant assigned number';
COMMENT ON COLUMN excluded_pairs.reason IS 'Optional reason for exclusion';
COMMENT ON CONSTRAINT unique_excluded_pair ON excluded_pairs IS 'Prevents duplicate pairs regardless of order (1,2) = (2,1)';
