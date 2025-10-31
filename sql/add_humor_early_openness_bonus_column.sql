-- Add column to track humor and early openness bonus details
-- This column stores information about whether bonuses were applied and their type

ALTER TABLE public.match_results 
ADD COLUMN IF NOT EXISTS humor_early_openness_bonus TEXT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.match_results.humor_early_openness_bonus IS 
'Tracks humor and early openness bonus application: "full" (both humor 1.15 + early openness 1.05), "partial" (only humor 1.15), "none" (no bonus applied)';

-- Create index for efficient querying of bonus types
CREATE INDEX IF NOT EXISTS idx_match_results_humor_early_openness_bonus 
ON public.match_results USING btree (humor_early_openness_bonus) 
TABLESPACE pg_default
WHERE humor_early_openness_bonus IS NOT NULL;

-- Add check constraint to ensure only valid values
ALTER TABLE public.match_results
ADD CONSTRAINT check_humor_early_openness_bonus_valid 
CHECK (
  humor_early_openness_bonus IS NULL 
  OR humor_early_openness_bonus IN ('full', 'partial', 'none')
);
