/**
 * Match the confirmation meanings used by the Twilio participant console.
 * "confirmed" means the participant confirmed interest in attending; payment
 * approval and organizer waivers are separate statuses.
 */
export function matchesParticipantConfirmationFilter(participant, filter) {
  if (filter === "confirmed") return participant?.attendance_confirmed === true

  if (filter === "awaiting_receipt") {
    return participant?.attendance_confirmed === true
      && participant?.receipt_approved !== true
      && participant?.PAID_DONE !== true
      && participant?.payment_waived !== true
  }

  if (filter === "declined") {
    return participant?.attendance_confirmed === false && Boolean(participant?.attendance_denied_at)
  }

  return true
}
