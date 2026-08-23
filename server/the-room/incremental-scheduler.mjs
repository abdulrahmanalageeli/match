export class TheRoomExtensionError extends Error {
  constructor(message, code = "EXTENSION_FAILED", details = {}) {
    super(message)
    this.name = "TheRoomExtensionError"
    this.code = code
    this.details = details
  }
}

function pairKey(left, right) {
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

function compareScore(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function genderSpread(tables, gender, candidateTable) {
  const counts = tables.map(table => table.members.reduce(
    (count, person) => count + (person.gender === gender ? 1 : 0),
    0,
  ) + (table.tableNumber === candidateTable ? 1 : 0))
  return Math.max(...counts) - Math.min(...counts)
}

function scheduleMetrics(rows, participants, newAttendeeIds, tableCount, roundCount) {
  const people = new Map(participants.map(person => [String(person.id), person]))
  const newcomerIds = new Set(newAttendeeIds.map(String))
  const pairCounts = new Map()
  const meetingCounts = new Map(participants.map(person => [String(person.id), 0]))
  let genderSpreadMax = 0

  for (let round = 1; round <= roundCount; round += 1) {
    for (let table = 1; table <= tableCount; table += 1) {
      const members = rows.filter(row => row.round_number === round && row.table_number === table).map(row => String(row.attendee_id))
      const genders = [...new Set(participants.map(person => person.gender))]
      for (const gender of genders) {
        const perTable = Array.from({ length: tableCount }, (_, index) => rows.filter(row => row.round_number === round && row.table_number === index + 1)
          .reduce((count, row) => count + (people.get(String(row.attendee_id))?.gender === gender ? 1 : 0), 0))
        genderSpreadMax = Math.max(genderSpreadMax, Math.max(...perTable) - Math.min(...perTable))
      }
      for (let left = 0; left < members.length; left += 1) {
        for (let right = left + 1; right < members.length; right += 1) {
          const key = pairKey(members[left], members[right])
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
          meetingCounts.set(members[left], (meetingCounts.get(members[left]) || 0) + 1)
          meetingCounts.set(members[right], (meetingCounts.get(members[right]) || 0) + 1)
        }
      }
    }
  }

  const repeatPairCount = [...pairCounts.values()].reduce((count, meetings) => count + Math.max(0, meetings - 1), 0)
  const newcomerPairCounts = [...pairCounts.entries()].filter(([key]) => {
    const [left, right] = key.split("|")
    return newcomerIds.has(left) && newcomerIds.has(right)
  })
  const meetingValues = [...meetingCounts.values()]
  return {
    repeatPairCount,
    uniquePairCount: pairCounts.size,
    genderSpreadMax,
    minMeetingsPerAttendee: Math.min(...meetingValues),
    maxMeetingsPerAttendee: Math.max(...meetingValues),
    averageMeetingsPerAttendee: Number((meetingValues.reduce((sum, value) => sum + value, 0) / meetingValues.length).toFixed(2)),
    newGuestPairCount: newcomerPairCounts.length,
    newGuestRepeatPairCount: newcomerPairCounts.reduce((count, [, meetings]) => count + Math.max(0, meetings - 1), 0),
  }
}

export function extendTheRoomSchedule({
  participants,
  existingSeats,
  newAttendeeIds,
  tableCount,
  roundCount,
}) {
  const people = new Map((participants || []).map(person => [String(person.id), { ...person, id: String(person.id) }]))
  const newcomerIds = (newAttendeeIds || []).map(String)
  const newcomerSet = new Set(newcomerIds)
  const tables = Number(tableCount)
  const rounds = Number(roundCount)

  if (!Number.isInteger(tables) || tables < 1 || !Number.isInteger(rounds) || rounds < 1) {
    throw new TheRoomExtensionError("Table and round counts must be positive integers", "INVALID_DIMENSIONS")
  }
  if (!newcomerIds.length) {
    return { rows: existingSeats.map(seat => ({ attendee_id: String(seat.attendee_id), round_number: Number(seat.round_number), table_number: Number(seat.table_number), seat_number: Number(seat.seat_number) })), metrics: scheduleMetrics(existingSeats, participants, [], tables, rounds) }
  }
  if (newcomerIds.some(id => !people.has(id))) throw new TheRoomExtensionError("Every new attendee must belong to the participant list", "UNKNOWN_ATTENDEE")

  const rows = (existingSeats || []).map(seat => ({
    attendee_id: String(seat.attendee_id),
    round_number: Number(seat.round_number),
    table_number: Number(seat.table_number),
    seat_number: Number(seat.seat_number),
  }))
  const existingIds = new Set(rows.map(row => row.attendee_id))
  if (newcomerIds.some(id => existingIds.has(id))) throw new TheRoomExtensionError("A new attendee is already seated", "ATTENDEE_ALREADY_SEATED")

  for (let round = 1; round <= rounds; round += 1) {
    const seated = rows.filter(row => row.round_number === round)
    if (new Set(seated.map(row => row.attendee_id)).size !== existingIds.size) {
      throw new TheRoomExtensionError("The active schedule is incomplete", "INCOMPLETE_ACTIVE_SCHEDULE", { round })
    }
  }

  const pairCounts = new Map()
  for (let round = 1; round <= rounds; round += 1) {
    for (let table = 1; table <= tables; table += 1) {
      const members = rows.filter(row => row.round_number === round && row.table_number === table).map(row => row.attendee_id)
      for (let left = 0; left < members.length; left += 1) {
        for (let right = left + 1; right < members.length; right += 1) {
          const key = pairKey(members[left], members[right])
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
        }
      }
    }
  }

  for (let round = 1; round <= rounds; round += 1) {
    const roundTables = Array.from({ length: tables }, (_, index) => {
      const tableNumber = index + 1
      const tableRows = rows.filter(row => row.round_number === round && row.table_number === tableNumber)
      return {
        tableNumber,
        members: tableRows.map(row => people.get(row.attendee_id)).filter(Boolean),
        nextSeat: tableRows.reduce((maximum, row) => Math.max(maximum, row.seat_number), 0) + 1,
      }
    })

    newcomerIds.forEach((attendeeId, newcomerIndex) => {
      const attendee = people.get(attendeeId)
      const candidates = roundTables.map(table => {
        const newCompanions = table.members.filter(person => newcomerSet.has(person.id))
        const repeatedNewPairs = newCompanions.reduce((count, person) => count + (pairCounts.get(pairKey(attendeeId, person.id)) || 0), 0)
        const repeatedMeetings = table.members.reduce((count, person) => count + (pairCounts.get(pairKey(attendeeId, person.id)) || 0), 0)
        const rotatedTieBreak = (table.tableNumber - 1 - newcomerIndex - round + tables * 4) % tables
        return {
          table,
          score: [
            repeatedNewPairs,
            newCompanions.length,
            repeatedMeetings,
            genderSpread(roundTables, attendee.gender, table.tableNumber),
            table.members.length,
            rotatedTieBreak,
          ],
        }
      }).sort((left, right) => compareScore(left.score, right.score))

      const selected = candidates[0].table
      rows.push({ attendee_id: attendeeId, round_number: round, table_number: selected.tableNumber, seat_number: selected.nextSeat++ })
      for (const person of selected.members) {
        const key = pairKey(attendeeId, person.id)
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
      }
      selected.members.push(attendee)
    })
  }

  const expectedCount = participants.length * rounds
  if (rows.length !== expectedCount) throw new TheRoomExtensionError("Every attendee must be seated once per round", "INCOMPLETE_EXTENSION", { expectedCount, actualCount: rows.length })

  return {
    rows,
    metrics: scheduleMetrics(rows, participants, newcomerIds, tables, rounds),
  }
}
