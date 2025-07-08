-- Add timer-related columns to match_results table
-- This will enable synchronized timer start times for all participants in a match

-- Add conversation_start_time column to store when the conversation timer started
ALTER TABLE match_results 
ADD COLUMN conversation_start_time TIMESTAMP WITH TIME ZONE;

-- Add conversation_duration column to store the timer duration in seconds
ALTER TABLE match_results 
ADD COLUMN conversation_duration INTEGER DEFAULT 300;

-- Add conversation_status column to track if conversation is active
ALTER TABLE match_results 
ADD COLUMN conversation_status TEXT DEFAULT 'pending' CHECK (conversation_status IN ('pending', 'active', 'finished'));

-- Add comments to document the new columns
COMMENT ON COLUMN match_results.conversation_start_time IS 'Timestamp when the conversation timer started for this match';
COMMENT ON COLUMN match_results.conversation_duration IS 'Duration of the conversation timer in seconds (default: 300)';
COMMENT ON COLUMN match_results.conversation_status IS 'Status of the conversation: pending, active, or finished';

-- Create an index for better query performance on conversation status
CREATE INDEX idx_match_results_conversation_status ON match_results(conversation_status);

-- Create an index for better query performance on conversation start time
CREATE INDEX idx_match_results_conversation_start_time ON match_results(conversation_start_time);

-- Add the same columns to group_matches table for group conversations
ALTER TABLE group_matches 
ADD COLUMN conversation_start_time TIMESTAMP WITH TIME ZONE;

ALTER TABLE group_matches 
ADD COLUMN conversation_duration INTEGER DEFAULT 300;

ALTER TABLE group_matches 
ADD COLUMN conversation_status TEXT DEFAULT 'pending' CHECK (conversation_status IN ('pending', 'active', 'finished'));

-- Add comments for group_matches table
COMMENT ON COLUMN group_matches.conversation_start_time IS 'Timestamp when the conversation timer started for this group';
COMMENT ON COLUMN group_matches.conversation_duration IS 'Duration of the conversation timer in seconds (default: 300)';
COMMENT ON COLUMN group_matches.conversation_status IS 'Status of the conversation: pending, active, or finished';

-- Create indexes for group_matches table
CREATE INDEX idx_group_matches_conversation_status ON group_matches(conversation_status);
CREATE INDEX idx_group_matches_conversation_start_time ON group_matches(conversation_start_time); 