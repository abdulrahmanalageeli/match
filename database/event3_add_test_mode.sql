-- Add test mode columns to event_state table
ALTER TABLE event_state ADD COLUMN IF NOT EXISTS test_mode_active BOOLEAN DEFAULT false;
ALTER TABLE event_state ADD COLUMN IF NOT EXISTS test_mode_snapshot JSONB;
