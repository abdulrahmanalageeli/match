const GENDERS = new Set(["male", "female"])
const BEAM_WIDTH = 128

export class TheRoomFixedRouteError extends Error {
  constructor(message) {
    super(message)
    this.name = "TheRoomFixedRouteError"
    this.code = "INVALID_FIXED_ROUTE_INPUT"
  }
}

function requireInput(condition, message) {
  if (!condition) throw new TheRoomFixedRouteError(message)
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0
}

function validInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum
}

function compareRoutes(left, right) {
  if (left.crowding !== right.crowding) return left.crowding - right.crowding
  if (left.genderOverflow !== right.genderOverflow) return left.genderOverflow - right.genderOverflow
  if (left.repeatPairCount !== right.repeatPairCount) return left.repeatPairCount - right.repeatPairCount
  if (left.emptyTables !== right.emptyTables) return left.emptyTables - right.emptyTables
  if (left.sameGenderCount !== right.sameGenderCount) return left.sameGenderCount - right.sameGenderCount
  for (let index = 0; index < left.route.length; index += 1) {
    if (left.route[index].tableNumber !== right.route[index].tableNumber) {
      return left.route[index].tableNumber - right.route[index].tableNumber
    }
  }
  return 0
}

function appendTable(state, table) {
  let repeatedMeetings = 0
  for (const bit of table.companionBits) {
    if ((state.met & bit) !== 0n) repeatedMeetings += 1
  }
  return {
    met: state.met | table.memberMask,
    crowding: state.crowding + table.crowding,
    genderOverflow: state.genderOverflow + table.genderOverflow,
    repeatPairCount: state.repeatPairCount + repeatedMeetings,
    emptyTables: state.emptyTables + Number(table.companionBits.length === 0),
    sameGenderCount: state.sameGenderCount + table.sameGenderCount,
    route: [...state.route, table],
  }
}

/**
 * Reserve a newcomer's complete remaining route without changing issued seats.
 * Table size and gender balance are preferences, never admission limits.
 * Repeat avoidance uses a bounded, deterministic beam search;
 * a result with repeats is not proof that a repeat-free route is impossible.
 * Repeats never disqualify a route: return the best complete route found even
 * when it repeats companions or grows a table beyond its preferred size.
 */
export function planFixedRoute({ attendee, participants, existingSeats, tableCount, roundCount, activeRound } = {}) {
  requireInput(validInteger(tableCount, 1, 50), "Table count must be an integer from 1 to 50.")
  requireInput(validInteger(roundCount, 1, 20), "Round count must be an integer from 1 to 20.")
  requireInput(validInteger(activeRound, 1, roundCount), "Active round must be within the event's rounds.")
  requireInput(attendee && validId(attendee.id) && GENDERS.has(attendee.gender), "A newcomer needs an ID and a male or female seating category.")
  requireInput(Array.isArray(participants), "Participants must be an array.")
  requireInput(Array.isArray(existingSeats), "Existing seats must be an array.")

  const people = new Map()
  for (const person of participants) {
    requireInput(person && validId(person.id) && GENDERS.has(person.gender), "Every participant needs an ID and a male or female seating category.")
    requireInput(!people.has(person.id), "Participant IDs must be unique.")
    people.set(person.id, { gender: person.gender, bit: 1n << BigInt(people.size) })
  }
  requireInput(!people.has(attendee.id) || people.get(attendee.id).gender === attendee.gender, "The newcomer's seating category must match their participant record.")

  const rounds = Array.from({ length: roundCount }, () => Array.from({ length: tableCount }, (_, index) => ({
    tableNumber: index + 1,
    genders: { male: 0, female: 0 },
    seats: new Set(),
    companionBits: [],
    memberMask: 0n,
  })))
  const seatedRounds = new Map()
  for (const row of existingSeats) {
    requireInput(row && validId(row.attendee_id) && people.has(row.attendee_id), "Every seat must reference a known participant.")
    requireInput(row.attendee_id !== attendee.id, "The newcomer already has an issued route.")
    requireInput(validInteger(row.round_number, 1, roundCount), "An existing seat has an invalid round.")
    requireInput(validInteger(row.table_number, 1, tableCount), "An existing seat has an invalid table.")
    requireInput(validInteger(row.seat_number, 1, 2147483647), "Seat numbers must be positive database integers.")
    const person = people.get(row.attendee_id)
    const table = rounds[row.round_number - 1][row.table_number - 1]
    const previousRounds = seatedRounds.get(row.attendee_id) ?? new Set()
    requireInput(!previousRounds.has(row.round_number), "A participant cannot have two seats in a round.")
    requireInput(!table.seats.has(row.seat_number), "An existing seat is assigned to more than one participant.")
    previousRounds.add(row.round_number)
    seatedRounds.set(row.attendee_id, previousRounds)
    table.seats.add(row.seat_number)
    table.genders[person.gender] += 1
    table.companionBits.push(person.bit)
    table.memberMask |= person.bit
  }

  const options = rounds.slice(activeRound - 1).map(tables => tables.map(table => {
    let seatNumber = 1
    while (table.seats.has(seatNumber)) seatNumber += 1
    return {
      ...table,
      sameGenderCount: table.genders[attendee.gender],
      crowding: Math.max(0, table.seats.size + 1 - 4),
      genderOverflow: Math.max(0, table.genders[attendee.gender] + 1 - 2),
      seatNumber,
    }
  }))

  // The arrival rule is predictable even when future rounds have different seats.
  const firstTable = [...options[0]].sort((left, right) =>
    left.crowding - right.crowding
    || left.genderOverflow - right.genderOverflow
    || Number(left.companionBits.length === 0) - Number(right.companionBits.length === 0)
    || left.sameGenderCount - right.sameGenderCount
    || left.tableNumber - right.tableNumber,
  )[0]
  let beam = [appendTable({ met: 0n, crowding: 0, genderOverflow: 0, repeatPairCount: 0, emptyTables: 0, sameGenderCount: 0, route: [] }, firstTable)]

  for (const tables of options.slice(1)) {
    const byMetGuests = new Map()
    for (const state of beam) {
      for (const table of tables) {
        const next = appendTable(state, table)
        // Routes with the same met guests have identical future repeat costs.
        // Keep their best route, which also collapses equivalent empty tables.
        const previous = byMetGuests.get(next.met)
        if (!previous || compareRoutes(next, previous) < 0) byMetGuests.set(next.met, next)
      }
    }
    beam = [...byMetGuests.values()].sort(compareRoutes).slice(0, BEAM_WIDTH)
  }

  const best = beam[0]
  return {
    rows: best.route.map((table, index) => ({
      attendee_id: attendee.id,
      round_number: activeRound + index,
      table_number: table.tableNumber,
      seat_number: table.seatNumber,
    })),
    repeatPairCount: best.repeatPairCount,
  }
}
