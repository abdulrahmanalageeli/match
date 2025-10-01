-- Add AI vibe analysis column to match_results table
-- This stores the shared AI-generated "why you matched well" analysis for both participants

-- Add the ai_vibe_analysis column to match_results
ALTER TABLE public.match_results 
ADD COLUMN IF NOT EXISTS ai_vibe_analysis TEXT NULL;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.match_results.ai_vibe_analysis IS 'Shared AI-generated vibe analysis explaining why the two participants matched well, generated after feedback submission';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_match_results_ai_vibe_analysis 
ON public.match_results USING btree (ai_vibe_analysis) 
WHERE ai_vibe_analysis IS NOT NULL;

-- Add constraint to ensure analysis is not empty string if provided
ALTER TABLE public.match_results 
ADD CONSTRAINT IF NOT EXISTS check_ai_vibe_analysis_not_empty 
CHECK (
  ai_vibe_analysis IS NULL 
  OR length(trim(ai_vibe_analysis)) > 0
);

-- Create composite index for efficient queries by participant and event
CREATE INDEX IF NOT EXISTS idx_match_results_participant_event_analysis 
ON public.match_results USING btree (participant_a_number, participant_b_number, event_id, ai_vibe_analysis) 
WHERE ai_vibe_analysis IS NOT NULL;
