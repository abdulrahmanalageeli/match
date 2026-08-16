-- Store one optional reflection after each Event3 group-ranking round.
-- Existing post-feedback rows are preserved and mapped to the nearest round.
ALTER TABLE public.event3_group_reflections
  ADD COLUMN IF NOT EXISTS group_round integer;

UPDATE public.event3_group_reflections
SET group_round = CASE WHEN source_phase = 'phase3_feedback' THEN 2 ELSE 1 END
WHERE group_round IS NULL;

UPDATE public.event3_group_reflections
SET source_phase = 'ranking' || group_round::text;

ALTER TABLE public.event3_group_reflections
  ALTER COLUMN group_round SET DEFAULT 1,
  ALTER COLUMN group_round SET NOT NULL,
  ALTER COLUMN source_phase SET DEFAULT 'ranking1';

ALTER TABLE public.event3_group_reflections
  DROP CONSTRAINT IF EXISTS event3_group_reflections_ranker_unique,
  DROP CONSTRAINT IF EXISTS event3_group_reflections_ranker_round_unique,
  DROP CONSTRAINT IF EXISTS event3_group_reflections_source_phase,
  DROP CONSTRAINT IF EXISTS event3_group_reflections_group_round;

ALTER TABLE public.event3_group_reflections
  ADD CONSTRAINT event3_group_reflections_ranker_round_unique
    UNIQUE (match_id, event_id, ranker_number, group_round),
  ADD CONSTRAINT event3_group_reflections_group_round
    CHECK (group_round IN (1, 2)),
  ADD CONSTRAINT event3_group_reflections_source_phase
    CHECK (source_phase IN ('ranking1', 'ranking2'));

COMMENT ON TABLE public.event3_group_reflections IS
  'Optional top-three reflection submitted after each Event3 group-ranking round; never used for live matching.';
