-- Attendance requests table for admin approval workflow
-- Stores pending attendance confirmations/denials from WhatsApp

CREATE TABLE IF NOT EXISTS attendance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  assigned_number INT,
  phone_number TEXT,
  request_type TEXT NOT NULL, -- 'confirm' | 'deny'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_requests_status ON attendance_requests(status);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_participant ON attendance_requests(participant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_created_at ON attendance_requests(created_at DESC);

-- Enable RLS
ALTER TABLE attendance_requests ENABLE ROW LEVEL SECURITY;

-- Allow anon access (admin panel uses anon key)
CREATE POLICY "Allow all access to attendance_requests" ON attendance_requests
  FOR ALL USING (true) WITH CHECK (true);
