-- Add columns for Twilio WhatsApp webhook integration
-- These columns track participant responses from Twilio quick reply buttons and receipt uploads

-- Attendance confirmation (from "تأكيد المشاركة" button)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS attendance_confirmed BOOLEAN DEFAULT false;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS attendance_confirmed_at TIMESTAMPTZ;

-- Attendance denial (from "اعتذار عن المشاركة" button)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS attendance_denied_at TIMESTAMPTZ;

-- Receipt upload (from image/PDF media message)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS receipt_received_at TIMESTAMPTZ;

-- Receipt approval workflow (admin approves/rejects uploaded receipts)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS receipt_approved BOOLEAN DEFAULT false;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS receipt_approved_at TIMESTAMPTZ;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS receipt_rejected BOOLEAN DEFAULT false;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS receipt_rejected_at TIMESTAMPTZ;
