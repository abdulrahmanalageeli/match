-- Migration: Add Interaction Synergy (Q35–Q41) and Intent & Goal (Q40) columns to participants
-- Safe to run multiple times with IF NOT EXISTS guards where possible

BEGIN;

-- New answer columns (store raw A/B/C answers; keep NULL if not answered)
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS conversational_role TEXT,           -- Q35: A/B/C
  ADD COLUMN IF NOT EXISTS conversation_depth_pref TEXT,       -- Q36: A/B
  ADD COLUMN IF NOT EXISTS social_battery TEXT,                -- Q37: A/B
  ADD COLUMN IF NOT EXISTS humor_subtype TEXT,                 -- Q38: A/B/C
  ADD COLUMN IF NOT EXISTS curiosity_style TEXT,               -- Q39: A/B/C
  ADD COLUMN IF NOT EXISTS intent_goal TEXT,                   -- Q40: A/B/C
  ADD COLUMN IF NOT EXISTS silence_comfort TEXT;               -- Q41: A/B

-- Value domain checks (allow NULL for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_conversational_role_check'
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_conversational_role_check
      CHECK (conversational_role IS NULL OR conversational_role IN ('A','B','C'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_conversation_depth_pref_check'
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_conversation_depth_pref_check
      CHECK (conversation_depth_pref IS NULL OR conversation_depth_pref IN ('A','B'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_social_battery_check'
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_social_battery_check
      CHECK (social_battery IS NULL OR social_battery IN ('A','B'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_humor_subtype_check'
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_humor_subtype_check
      CHECK (humor_subtype IS NULL OR humor_subtype IN ('A','B','C'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_curiosity_style_check'
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_curiosity_style_check
      CHECK (curiosity_style IS NULL OR curiosity_style IN ('A','B','C'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_intent_goal_check'
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_intent_goal_check
      CHECK (intent_goal IS NULL OR intent_goal IN ('A','B','C'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_silence_comfort_check'
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_silence_comfort_check
      CHECK (silence_comfort IS NULL OR silence_comfort IN ('A','B'));
  END IF;
END $$;

-- Optional indexes (uncomment if you plan to filter on these often)
-- CREATE INDEX IF NOT EXISTS idx_participants_conversational_role ON public.participants(conversational_role);
-- CREATE INDEX IF NOT EXISTS idx_participants_conversation_depth_pref ON public.participants(conversation_depth_pref);
-- CREATE INDEX IF NOT EXISTS idx_participants_social_battery ON public.participants(social_battery);
-- CREATE INDEX IF NOT EXISTS idx_participants_humor_subtype ON public.participants(humor_subtype);
-- CREATE INDEX IF NOT EXISTS idx_participants_curiosity_style ON public.participants(curiosity_style);
-- CREATE INDEX IF NOT EXISTS idx_participants_intent_goal ON public.participants(intent_goal);
-- CREATE INDEX IF NOT EXISTS idx_participants_silence_comfort ON public.participants(silence_comfort);

COMMIT;
