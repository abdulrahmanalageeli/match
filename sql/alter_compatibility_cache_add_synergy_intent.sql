-- Migration: Add interaction synergy + intent goal to compatibility_cache
-- Safe re-run: IF NOT EXISTS guards

BEGIN;

ALTER TABLE public.compatibility_cache
  ADD COLUMN IF NOT EXISTS synergy_hash text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS interaction_synergy_score numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intent_goal_score numeric(5, 2) NOT NULL DEFAULT 0;

-- Optional: index for synergy_hash lookups
CREATE INDEX IF NOT EXISTS idx_cache_synergy_hash
  ON public.compatibility_cache USING btree (synergy_hash);

COMMIT;
