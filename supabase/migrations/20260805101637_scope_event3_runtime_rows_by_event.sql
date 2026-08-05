-- Event 3 ranking rows must be reusable across events. The previous unique
-- key omitted event_id, so returning attendees could collide with rankings
-- they submitted at an older event.
ALTER TABLE public.participant_rankings
  DROP CONSTRAINT IF EXISTS participant_rankings_unique;

ALTER TABLE public.participant_rankings
  DROP CONSTRAINT IF EXISTS participant_rankings_event_unique;

ALTER TABLE public.participant_rankings
  ADD CONSTRAINT participant_rankings_event_unique
  UNIQUE (match_id, event_id, ranker_number, ranked_number);

CREATE INDEX IF NOT EXISTS idx_participant_rankings_match_event_ranker
  ON public.participant_rankings(match_id, event_id, ranker_number);

-- Scope organizer requests to the event that created them. Keep legacy rows
-- nullable so the application can surface unresolved pre-migration requests
-- without mislabeling historical conversations.
ALTER TABLE public.organizer_requests
  ADD COLUMN IF NOT EXISTS event_id integer;

UPDATE public.organizer_requests
SET event_id = COALESCE(
  (
    SELECT current_event_id
    FROM public.event_state
    WHERE match_id = '00000000-0000-0000-0000-000000000000'
    LIMIT 1
  ),
  20
)
WHERE event_id IS NULL
  AND status IS DISTINCT FROM 'resolved';

CREATE INDEX IF NOT EXISTS idx_organizer_requests_event_status
  ON public.organizer_requests(event_id, status, updated_at DESC);
