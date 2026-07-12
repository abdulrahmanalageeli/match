-- Ensures the match_preference column exists on event3_matches.
-- Without this column, e3-submit-match-preference (api/participant.mjs) falls back
-- to overwriting phase3_feedback entirely, silently destroying wantConnect and other
-- real feedback fields already submitted by the participant.
ALTER TABLE public.event3_matches ADD COLUMN IF NOT EXISTS match_preference text
  CHECK (match_preference IN ('choice', 'algorithm', 'both', 'neither'));
