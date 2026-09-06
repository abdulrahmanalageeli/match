export function isEvent3SignedUp(participant, currentEventId) {
  const eventId = Number(currentEventId)
  if (!Number.isInteger(eventId) || eventId <= 0 || !participant) return false

  return Number(participant.event_id) === eventId
    || participant.signup_for_next_event === true
    || participant.auto_signup_next_event === true
}

export function isEvent3PaidForEvent(participant, currentEventId) {
  const eventId = Number(currentEventId)
  if (!Number.isInteger(eventId) || eventId <= 0 || !participant) return false

  return participant.PAID_DONE === true
    && Number(participant.payment_completed_event_id) === eventId
}

export function isEvent3JoinEligible(participant, currentEventId, isInActiveRoster = false) {
  const eventId = Number(currentEventId)
  if (!Number.isInteger(eventId) || eventId <= 0 || !participant) return false

  return isInActiveRoster === true || isEvent3PaidForEvent(participant, currentEventId)
}
