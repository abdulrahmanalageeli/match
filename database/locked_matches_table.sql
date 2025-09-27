-- Create locked_matches table for storing permanent participant pairs
-- These pairs will always be matched together in future match generations
CREATE TABLE locked_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  participant1_number INTEGER NOT NULL,
  participant2_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin',
  reason TEXT DEFAULT 'Admin locked match',
  original_compatibility_score NUMERIC(5,2),
  original_match_round INTEGER,
  
  -- Ensure participant1 and participant2 are different
  CONSTRAINT different_participants_locked CHECK (participant1_number != participant2_number),
  
  -- Foreign key constraints to ensure participants exist
  CONSTRAINT fk_locked_matches_participant1 
    FOREIGN KEY (participant1_number, match_id) 
    REFERENCES participants (assigned_number, match_id) 
    ON UPDATE CASCADE ON DELETE CASCADE,
    
  CONSTRAINT fk_locked_matches_participant2 
    FOREIGN KEY (participant2_number, match_id) 
    REFERENCES participants (assigned_number, match_id) 
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX idx_locked_matches_match_id ON locked_matches(match_id);
CREATE INDEX idx_locked_matches_participants ON locked_matches(participant1_number, participant2_number);

-- Create a unique index to prevent duplicate pairs in both directions
-- This uses an expression index with LEAST/GREATEST to ensure (1,2) and (2,1) are treated as duplicates
CREATE UNIQUE INDEX idx_locked_matches_unique_bidirectional 
ON locked_matches(match_id, LEAST(participant1_number, participant2_number), GREATEST(participant1_number, participant2_number));

-- Add comments for documentation
COMMENT ON TABLE locked_matches IS 'Stores admin-defined participant pairs that should always be matched together in future generations';
COMMENT ON COLUMN locked_matches.match_id IS 'References the match/event ID';
COMMENT ON COLUMN locked_matches.participant1_number IS 'First participant assigned number';
COMMENT ON COLUMN locked_matches.participant2_number IS 'Second participant assigned number';
COMMENT ON COLUMN locked_matches.original_compatibility_score IS 'The compatibility score when this match was first locked';
COMMENT ON COLUMN locked_matches.original_match_round IS 'The round when this match was first created';
COMMENT ON COLUMN locked_matches.reason IS 'Optional reason for locking this match';
COMMENT ON INDEX idx_locked_matches_unique_bidirectional IS 'Prevents duplicate locked pairs regardless of order (1,2) = (2,1)';
