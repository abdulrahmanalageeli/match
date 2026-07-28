-- Distinguishes an organizer-granted seat from a paid/receipt-approved seat.
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS payment_waived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_participants_payment_waived
  ON participants (payment_waived)
  WHERE payment_waived = true;
