export class TheRoomLiveStateError extends Error {
  constructor(message, code = "INVALID_ACTIVE_ROUND", details = {}) {
    super(message)
    this.name = "TheRoomLiveStateError"
    this.code = code
    this.details = details
  }
}

export function normalizeTheRoomActiveRound(value, roundCount) {
  const round = Number(value)
  const maximum = Number(roundCount)
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new TheRoomLiveStateError("The event has an invalid round count", "INVALID_ROUND_COUNT")
  }
  if (!Number.isInteger(round) || round < 1 || round > maximum) {
    throw new TheRoomLiveStateError(
      `The active round must be between 1 and ${maximum}`,
      "INVALID_ACTIVE_ROUND",
      { minimum: 1, maximum, requested: value },
    )
  }
  return round
}

export function resolveTheRoomRoundAdvance({ expectedRound, requestedRound, currentRound, roundCount }) {
  const expected = normalizeTheRoomActiveRound(expectedRound, roundCount)
  const requested = normalizeTheRoomActiveRound(requestedRound, roundCount)
  const current = normalizeTheRoomActiveRound(currentRound, roundCount)

  if (requested !== expected + 1) {
    throw new TheRoomLiveStateError(
      "The active round can only advance by one round",
      "INVALID_ROUND_TRANSITION",
      { expectedRound: expected, requestedRound: requested },
    )
  }
  if (current >= requested) return { activeRound: current, changed: false }
  if (current !== expected) {
    throw new TheRoomLiveStateError(
      "The active round changed on another device",
      "ROUND_STATE_CHANGED",
      { expectedRound: expected, currentRound: current },
    )
  }
  return { activeRound: requested, changed: true }
}
