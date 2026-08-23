export class TheRoomMoveError extends Error {
  constructor(message, code = "MOVE_FAILED", details = {}) {
    super(message)
    this.name = "TheRoomMoveError"
    this.code = code
    this.details = details
  }
}

function pairKey(left, right) {
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

export function analyzeTheRoomMove({ seats, attendees, attendeeId, roundNumber, targetTable, tableCount }) {
  const guestId = String(attendeeId || "")
  const round = Number(roundNumber)
  const table = Number(targetTable)
  const tables = Number(tableCount)
  if (!guestId || !Number.isInteger(round) || round < 1 || !Number.isInteger(table) || table < 1 || table > tables) {
    throw new TheRoomMoveError("Choose a valid guest, round, and table", "INVALID_MOVE")
  }

  const normalized = (seats || []).map(seat => ({
    ...seat,
    attendee_id: String(seat.attendee_id),
    round_number: Number(seat.round_number),
    table_number: Number(seat.table_number),
    seat_number: Number(seat.seat_number),
  }))
  const current = normalized.find(seat => seat.attendee_id === guestId && seat.round_number === round)
  if (!current) throw new TheRoomMoveError("The guest has no seat in this round", "SEAT_NOT_FOUND")
  if (current.table_number === table) throw new TheRoomMoveError("The guest is already at this table", "SAME_TABLE")

  const targetMembers = normalized.filter(seat => seat.round_number === round && seat.table_number === table)
  const priorPairs = new Set()
  for (let otherRound = 1; otherRound <= Math.max(...normalized.map(seat => seat.round_number), 1); otherRound += 1) {
    if (otherRound === round) continue
    const guestSeat = normalized.find(seat => seat.round_number === otherRound && seat.attendee_id === guestId)
    if (!guestSeat) continue
    normalized
      .filter(seat => seat.round_number === otherRound && seat.table_number === guestSeat.table_number && seat.attendee_id !== guestId)
      .forEach(seat => priorPairs.add(pairKey(guestId, seat.attendee_id)))
  }

  const attendeeNumbers = new Map((attendees || []).map(person => [String(person.id), Number(person.attendee_number)]))
  const repeatedWithIds = targetMembers
    .map(seat => seat.attendee_id)
    .filter(id => priorPairs.has(pairKey(guestId, id)))
  const nextSeatNumber = targetMembers.reduce((maximum, seat) => Math.max(maximum, seat.seat_number), 0) + 1

  return {
    seatId: current.id,
    fromTable: current.table_number,
    toTable: table,
    roundNumber: round,
    nextSeatNumber,
    repeatedWithIds,
    repeatedWithNumbers: repeatedWithIds.map(id => attendeeNumbers.get(id)).filter(Number.isFinite),
  }
}
