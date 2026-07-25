-- WhatsApp messages table for chat platform
-- Stores all inbound and outbound WhatsApp messages per participant

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  assigned_number INT,
  phone_number TEXT,
  direction TEXT NOT NULL DEFAULT 'outbound', -- 'inbound' | 'outbound'
  message_body TEXT,
  button_payload TEXT,
  button_text TEXT,
  media_url TEXT,
  media_content_type TEXT,
  template_sid TEXT,
  template_variables JSONB,
  twilio_message_sid TEXT,
  status TEXT DEFAULT 'sent', -- 'received' | 'sent' | 'failed' | 'delivered' | 'read'
  is_auto_reply BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_wa_messages_participant ON whatsapp_messages(participant_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_assigned_number ON whatsapp_messages(assigned_number);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created_at ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_direction ON whatsapp_messages(direction);

-- Enable RLS
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Allow anon access (admin panel uses anon key)
CREATE POLICY "Allow all access to whatsapp_messages" ON whatsapp_messages
  FOR ALL USING (true) WITH CHECK (true);
