-- Create table for storing match feedback
CREATE TABLE IF NOT EXISTS match_feedback (
    id SERIAL PRIMARY KEY,
    match_id UUID NOT NULL,
    participant_number INTEGER NOT NULL,
    round INTEGER NOT NULL,
    enjoyment TEXT,
    connection TEXT,
    would_meet_again TEXT,
    overall_rating TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(match_id, participant_number, round)
);

-- Create table for tracking match completions
CREATE TABLE IF NOT EXISTS match_completions (
    id SERIAL PRIMARY KEY,
    match_id UUID NOT NULL,
    participant_number INTEGER NOT NULL,
    round INTEGER NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(match_id, participant_number, round)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_match_feedback_match_id ON match_feedback(match_id);
CREATE INDEX IF NOT EXISTS idx_match_feedback_participant ON match_feedback(participant_number);
CREATE INDEX IF NOT EXISTS idx_match_completions_match_id ON match_completions(match_id);
CREATE INDEX IF NOT EXISTS idx_match_completions_participant ON match_completions(participant_number); 