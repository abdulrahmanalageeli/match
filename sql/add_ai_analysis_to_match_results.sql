-- Add AI personality analysis column to match_results table
-- This stores the AI-generated compatibility analysis for each specific match
-- Benefits:
-- 1. Analysis is tied to the specific match, not the participant
-- 2. Different events can have different analyses for the same participants
-- 3. Can be regenerated per event without affecting other events
-- 4. More logical data structure - analysis belongs to the match relationship

-- Add the column
ALTER TABLE public.match_results 
ADD COLUMN ai_personality_analysis TEXT NULL;

-- Add comment to document the column
COMMENT ON COLUMN public.match_results.ai_personality_analysis IS 
'AI-generated compatibility analysis for this specific match. Generated using GPT-4o-mini based on both participants survey data, vibe descriptions, and lifestyle preferences. Includes personalized insights about shared interests, lifestyle compatibility, and activity suggestions.';

-- Add constraint to prevent empty strings (must be NULL or have content)
ALTER TABLE public.match_results 
ADD CONSTRAINT match_results_ai_analysis_not_empty 
CHECK (ai_personality_analysis IS NULL OR length(trim(ai_personality_analysis)) > 0);

-- Create index for efficient querying of matches with analysis
CREATE INDEX idx_match_results_ai_analysis 
ON public.match_results(match_id, event_id) 
WHERE ai_personality_analysis IS NOT NULL;

-- Create composite index for event-specific analysis queries
CREATE INDEX idx_match_results_analysis_ready 
ON public.match_results(event_id, match_id, round) 
WHERE ai_personality_analysis IS NOT NULL;

-- Create index for participant-specific analysis lookup
CREATE INDEX idx_match_results_participant_analysis 
ON public.match_results(participant_number, event_id) 
WHERE ai_personality_analysis IS NOT NULL;

-- Verify the changes
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'match_results' 
AND column_name = 'ai_personality_analysis';

-- Show indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'match_results' 
AND indexname LIKE '%analysis%';
