-- Add nationality, nationality preference, and preferred age range columns
-- Run this in Supabase SQL editor or your migration pipeline

BEGIN;

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS nationality text NULL,
  ADD COLUMN IF NOT EXISTS prefer_same_nationality boolean NULL,
  ADD COLUMN IF NOT EXISTS preferred_age_min integer NULL,
  ADD COLUMN IF NOT EXISTS preferred_age_max integer NULL;

-- Basic bounds and consistency checks for age range
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_preferred_age_bounds'
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_preferred_age_bounds
      CHECK (
        (
          preferred_age_min IS NULL AND preferred_age_max IS NULL
        ) OR (
          preferred_age_min IS NOT NULL AND preferred_age_max IS NOT NULL
          AND preferred_age_min >= 16 AND preferred_age_max <= 80
          AND preferred_age_min <= preferred_age_max
        )
      );
  END IF;
END $$;

-- Optional: index for filtering/searching by nationality
CREATE INDEX IF NOT EXISTS idx_participants_nationality ON public.participants (nationality);

COMMIT;
