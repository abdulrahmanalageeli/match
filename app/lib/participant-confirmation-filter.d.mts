export interface ParticipantConfirmationStatus {
  attendance_confirmed?: boolean | null
  attendance_denied_at?: string | null
  receipt_approved?: boolean | null
  PAID_DONE?: boolean | null
  payment_waived?: boolean | null
}

export function matchesParticipantConfirmationFilter(
  participant: ParticipantConfirmationStatus,
  filter: string,
): boolean
