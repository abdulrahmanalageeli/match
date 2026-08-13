export function isEvent3SignedUp(participant, currentEventId) {
  const eventId = Number(currentEventId)
  if (!Number.isInteger(eventId) || eventId <= 0 || !participant) return false

  return Number(participant.event_id) === eventId
    || participant.signup_for_next_event === true
    || participant.auto_signup_next_event === true
}
