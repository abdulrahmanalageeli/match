-- Add humor_multiplier and humor_early_openness_bonus columns to compatibility_cache table
-- This ensures cached compatibility calculations include bonus information

-- Add humor_multiplier column (stores the multiplier value: 1.0, 1.05, or 1.15)
ALTER TABLE public.compatibility_cache 
ADD COLUMN IF NOT EXISTS humor_multiplier NUMERIC DEFAULT 1.0;

-- Add humor_early_openness_bonus column (stores the bonus type: 'none', 'partial', or 'full')
ALTER TABLE public.compatibility_cache 
ADD COLUMN IF NOT EXISTS humor_early_openness_bonus TEXT DEFAULT 'none';

-- Add check constraint to ensure valid bonus types
ALTER TABLE public.compatibility_cache
ADD CONSTRAINT humor_early_openness_bonus_check 
CHECK (humor_early_openness_bonus IN ('none', 'partial', 'full'));

-- Update existing NULL values to 'none' (default)
UPDATE public.compatibility_cache 
SET humor_early_openness_bonus = 'none'
WHERE humor_early_openness_bonus IS NULL;

-- Update existing NULL humor_multiplier values to 1.0 (no bonus)
UPDATE public.compatibility_cache 
SET humor_multiplier = 1.0
WHERE humor_multiplier IS NULL;

-- Verify the changes
SELECT 
  COUNT(*) as total_cached,
  COUNT(CASE WHEN humor_early_openness_bonus = 'full' THEN 1 END) as full_bonus,
  COUNT(CASE WHEN humor_early_openness_bonus = 'partial' THEN 1 END) as partial_bonus,
  COUNT(CASE WHEN humor_early_openness_bonus = 'none' THEN 1 END) as no_bonus
FROM public.compatibility_cache;

-- Expected result: All records should have a valid bonus type
