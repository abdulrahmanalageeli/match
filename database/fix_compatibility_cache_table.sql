-- Fix compatibility_cache table by adding missing fields
-- Run this to add the missing hash fields that the caching code expects

ALTER TABLE public.compatibility_cache 
ADD COLUMN IF NOT EXISTS combined_content_hash text NOT NULL DEFAULT '';

ALTER TABLE public.compatibility_cache 
ADD COLUMN IF NOT EXISTS attachment_hash text NOT NULL DEFAULT '';

ALTER TABLE public.compatibility_cache 
ADD COLUMN IF NOT EXISTS communication_hash text NOT NULL DEFAULT '';

ALTER TABLE public.compatibility_cache 
ADD COLUMN IF NOT EXISTS lifestyle_hash text NOT NULL DEFAULT '';

ALTER TABLE public.compatibility_cache 
ADD COLUMN IF NOT EXISTS core_values_hash text NOT NULL DEFAULT '';

-- Update the unique constraint to include the combined_content_hash
ALTER TABLE public.compatibility_cache 
DROP CONSTRAINT IF EXISTS cache_unique;

ALTER TABLE public.compatibility_cache 
ADD CONSTRAINT cache_unique UNIQUE (
  participant_a_number,
  participant_b_number,
  combined_content_hash
);

-- Add index for the new combined hash field
CREATE INDEX IF NOT EXISTS idx_cache_combined_hash 
ON public.compatibility_cache USING btree (combined_content_hash);

-- Verify the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'compatibility_cache' 
ORDER BY ordinal_position;
