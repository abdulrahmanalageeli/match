export function confirmationPaymentState(participant, currentEventId) {
  if (
    participant?.payment_waived === true
    && Number(participant?.payment_waived_event_id) === Number(currentEventId)
  ) return "waived"
  if (
    participant?.PAID_DONE === true
    && Number(participant?.payment_completed_event_id) === Number(currentEventId)
  ) return "paid"
  return "payment_pending"
}

export function isParticipantEnrolledForEvent(participant, currentEventId) {
  const eventId = Number(currentEventId)
  if (!Number.isInteger(eventId) || eventId <= 0) return false
  if (Number(participant?.event_id) === eventId) return true
  if (participant?.auto_signup_next_event === true) return true
  // This flag is reset during event rollover, so a true value always refers
  // to the upcoming/current event; signup_event_id may contain legacy data.
  return participant?.signup_for_next_event === true
}

export function isParticipantContactedForEvent(participant, currentEventId) {
  const eventId = Number(currentEventId)
  if (!Number.isInteger(eventId) || eventId <= 0) return false
  return Number(participant?.whatsapp_contacted_event_id) === eventId
}

export function paymentAccessState(participant, currentEventId) {
  if (isParticipantContactedForEvent(participant, currentEventId)) return "eligible"
  if (!isParticipantEnrolledForEvent(participant, currentEventId)) return "not_enrolled"
  return "not_contacted"
}

export function attendanceDeclineAccessState(participant, currentEventId) {
  if (isParticipantContactedForEvent(participant, currentEventId)) return "eligible"
  if (!isParticipantEnrolledForEvent(participant, currentEventId)) return "not_enrolled"
  return "not_contacted"
}
