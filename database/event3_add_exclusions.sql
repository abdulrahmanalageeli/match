-- Table for conflict-of-interest / do-not-match pairs in event3
CREATE TABLE IF NOT EXISTS event3_exclusions (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  event_id INTEGER NOT NULL DEFAULT 1,
  participant_a_number INTEGER NOT NULL,
  participant_b_number INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (match_id, event_id, participant_a_number, participant_b_number)
);

CREATE INDEX IF NOT EXISTS idx_event3_exclusions_match_event ON event3_exclusions(match_id, event_id);
