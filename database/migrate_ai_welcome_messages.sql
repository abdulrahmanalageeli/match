-- =============================================================
-- Migration: Copy existing _ai_welcome from participants.survey_data
-- into event3_ai_welcome_messages (does NOT remove from survey_data)
-- =============================================================

DO $$
DECLARE
  row RECORD;
  sd jsonb;
  welcome text;
  e3_match_id uuid := '00000000-0000-0000-0000-000000000003';
  main_match_id uuid := '00000000-0000-0000-0000-000000000000';
  current_event_id integer;
BEGIN
  -- Get current event_id from event_state
  SELECT es.current_event_id INTO current_event_id
  FROM public.event_state es
  WHERE es.match_id = e3_match_id
  LIMIT 1;

  IF current_event_id IS NULL THEN
    current_event_id := 20;
  END IF;

  -- Iterate over participants who have _ai_welcome in survey_data
  FOR row IN
    SELECT assigned_number, survey_data
    FROM public.participants
    WHERE match_id = main_match_id
      AND survey_data ? '_ai_welcome'
  LOOP
    BEGIN
      sd := row.survey_data::jsonb;
      welcome := sd ->> '_ai_welcome';

      IF welcome IS NOT NULL AND welcome <> '' THEN
        INSERT INTO public.event3_ai_welcome_messages
          (match_id, event_id, participant_number, welcome_message, generated_by)
        VALUES
          (e3_match_id, current_event_id, row.assigned_number, welcome, 'migrated')
        ON CONFLICT (match_id, event_id, participant_number) DO UPDATE
          SET welcome_message = EXCLUDED.welcome_message,
              generated_at = now();
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped participant %: %', row.assigned_number, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Migration complete — copied AI welcome messages to event3_ai_welcome_messages';
END $$;
