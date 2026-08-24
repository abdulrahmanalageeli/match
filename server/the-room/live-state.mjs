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
