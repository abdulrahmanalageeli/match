-- Add open_age_preference flag so a participant can opt out of age limits entirely
BEGIN;

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS open_age_preference boolean NULL;

-- Optional: simple index for filters
CREATE INDEX IF NOT EXISTS idx_participants_open_age_pref ON public.participants (open_age_preference);

COMMIT;
