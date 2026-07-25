-- Add admin_seen_at column for tracking which inbound messages admin has viewed
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS admin_seen_at TIMESTAMPTZ;

-- Add needs_organizer flag for messages that look like organizer requests
-- (unrecognized text messages that triggered the help/auto-reply)
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS needs_organizer BOOLEAN DEFAULT false;

-- Index for efficient unread queries
CREATE INDEX IF NOT EXISTS idx_wa_messages_admin_unseen ON whatsapp_messages(direction, admin_seen_at) WHERE direction = 'inbound' AND admin_seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_needs_organizer ON whatsapp_messages(needs_organizer) WHERE needs_organizer = true;
