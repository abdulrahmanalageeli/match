-- Add any_gender_preference column to participants table
-- This allows participants to indicate they're okay matching with any gender (both male and female)

ALTER TABLE public.participants 
ADD COLUMN any_gender_preference boolean NOT NULL DEFAULT false;

-- Add constraint to ensure the column is not null
ALTER TABLE public.participants 
ADD CONSTRAINT check_any_gender_preference_valid 
CHECK (any_gender_preference IS NOT NULL);

-- Add index for performance on gender preference queries
CREATE INDEX IF NOT EXISTS idx_participants_any_gender_preference 
ON public.participants USING btree (any_gender_preference) 
WHERE (any_gender_preference = true);

-- Add composite index for gender matching logic
CREATE INDEX IF NOT EXISTS idx_participants_gender_preferences 
ON public.participants USING btree (gender, same_gender_preference, any_gender_preference) 
WHERE (gender IS NOT NULL);

-- Add comment to document the column purpose
COMMENT ON COLUMN public.participants.any_gender_preference IS 
'Indicates if participant is okay matching with any gender (both male and female). Takes precedence over same_gender_preference when true.';

-- Optional: Add constraint to ensure logical consistency
-- (A participant cannot have both same_gender_preference AND any_gender_preference as true)
ALTER TABLE public.participants 
ADD CONSTRAINT check_gender_preference_consistency 
CHECK (NOT (same_gender_preference = true AND any_gender_preference = true));
