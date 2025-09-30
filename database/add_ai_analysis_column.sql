-- Add AI analysis column to participants table for GPT-generated personality analysis
-- This column will store AI-generated analysis of each participant's personality
-- which can be used for generating pair compatibility analysis

-- Add the ai_personality_analysis column
ALTER TABLE public.participants 
ADD COLUMN ai_personality_analysis TEXT NULL;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.participants.ai_personality_analysis IS 'AI-generated personality analysis using GPT API based on survey responses, used for pair compatibility analysis';

-- Create index for efficient querying when generating pair analysis
CREATE INDEX IF NOT EXISTS idx_participants_ai_analysis 
ON public.participants USING btree (ai_personality_analysis) 
WHERE ai_personality_analysis IS NOT NULL;

-- Create composite index for efficient pair analysis queries
CREATE INDEX IF NOT EXISTS idx_participants_analysis_ready 
ON public.participants USING btree (event_id, ai_personality_analysis) 
WHERE ai_personality_analysis IS NOT NULL AND survey_data IS NOT NULL;

-- Add constraint to ensure analysis is not empty string if provided
ALTER TABLE public.participants 
ADD CONSTRAINT check_ai_analysis_not_empty 
CHECK (
  ai_personality_analysis IS NULL 
  OR length(trim(ai_personality_analysis)) > 0
);
