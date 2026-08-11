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
  return participant?.signup_for_next_event === true && Number(participant?.signup_event_id) === eventId
}

export function paymentAccessState(participant, currentEventId) {
  if (!isParticipantEnrolledForEvent(participant, currentEventId)) return "not_enrolled"
  if (participant?.PAID !== true || Number(participant?.whatsapp_contacted_event_id) !== Number(currentEventId)) return "not_contacted"
  return "eligible"
}

export function attendanceDeclineAccessState(participant, currentEventId) {
  const eventId = Number(currentEventId)
  const contactedForCurrentEvent = participant?.PAID === true
    && Number(participant?.whatsapp_contacted_event_id) === eventId

  // A current-event invitee must always be able to decline the invitation,
  // even when an older account has stale/missing signup_event_id metadata.
  if (contactedForCurrentEvent) return "eligible"
  if (!isParticipantEnrolledForEvent(participant, eventId)) return "not_enrolled"
  return "not_contacted"
}
