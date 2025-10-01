-- Add AI personality analysis column to match_results table
-- This stores the shared AI-generated "why you matched well" analysis for both participants
-- Note: Column already exists in match_results table as ai_personality_analysis

-- Verify the column exists (should already be there)
-- If not, add it:
-- ALTER TABLE public.match_results 
-- ADD COLUMN IF NOT EXISTS ai_personality_analysis TEXT NULL;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.match_results.ai_personality_analysis IS 'Shared AI-generated vibe analysis explaining why the two participants matched well, generated after feedback submission. Shared between both participants in the match.';

-- Create index for efficient querying (if not exists)
CREATE INDEX IF NOT EXISTS idx_match_results_ai_personality_analysis 
ON public.match_results USING btree (ai_personality_analysis) 
WHERE ai_personality_analysis IS NOT NULL;

-- Add constraint to ensure analysis is not empty string if provided (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_ai_personality_analysis_not_empty'
  ) THEN
    ALTER TABLE public.match_results 
    ADD CONSTRAINT check_ai_personality_analysis_not_empty 
    CHECK (
      ai_personality_analysis IS NULL 
      OR length(trim(ai_personality_analysis)) > 0
    );
  END IF;
END $$;

-- Create composite index for efficient queries by participant and event
CREATE INDEX IF NOT EXISTS idx_match_results_participant_event_personality_analysis 
ON public.match_results USING btree (participant_a_number, participant_b_number, event_id, ai_personality_analysis) 
WHERE ai_personality_analysis IS NOT NULL;
