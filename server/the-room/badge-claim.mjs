const CLAIMABLE_GENDERS = new Set(["female", "male"])

function candidateNumber(attendee) {
  const value = Number(attendee?.attendee_number)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

function compareScore(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function tableKey(roundNumber, tableNumber) {
  return `${roundNumber}:${tableNumber}`
}

function reassignmentScore({ attendee, attendees, seats, requestedGender, tableCount, roundCount, activeRound }) {
  const people = new Map(attendees.map(person => [String(person.id), person]))
  const counts = new Map()
  const firstRound = Math.max(1, Number(activeRound) || 1)
  const tables = Math.max(1, Number(tableCount) || 1)
  const rounds = Math.max(firstRound, Number(roundCount) || firstRound)

  for (let round = firstRound; round <= rounds; round += 1) {
    for (let table = 1; table <= tables; table += 1) {
      counts.set(tableKey(round, table), { female: 0, male: 0 })
    }
  }
  for (const seat of seats) {
    const round = Number(seat.round_number)
    const table = Number(seat.table_number)
    if (round < firstRound || round > rounds || table < 1 || table > tables) continue
    const person = people.get(String(seat.attendee_id))
    if (!CLAIMABLE_GENDERS.has(person?.gender)) continue
    counts.get(tableKey(round, table))[person.gender] += 1
  }

  const attendeeSeats = seats.filter(seat =>
    String(seat.attendee_id) === String(attendee.id)
    && Number(seat.round_number) >= firstRound
    && Number(seat.round_number) <= rounds
  )
  for (const seat of attendeeSeats) {
    const count = counts.get(tableKey(Number(seat.round_number), Number(seat.table_number)))
    if (!count) continue
    if (CLAIMABLE_GENDERS.has(attendee.gender)) count[attendee.gender] -= 1
    count[requestedGender] += 1
  }

  let genderSpreadMax = 0
  let tableGapMax = 0
  let tableGapTotal = 0
  for (let round = firstRound; round <= rounds; round += 1) {
    const femaleCounts = []
    const maleCounts = []
    for (let table = 1; table <= tables; table += 1) {
      const count = counts.get(tableKey(round, table))
      femaleCounts.push(count.female)
      maleCounts.push(count.male)
      const gap = Math.abs(count.female - count.male)
      tableGapMax = Math.max(tableGapMax, gap)
      tableGapTotal += gap
    }
    genderSpreadMax = Math.max(
      genderSpreadMax,
      Math.max(...femaleCounts) - Math.min(...femaleCounts),
      Math.max(...maleCounts) - Math.min(...maleCounts),
    )
  }

  const expectedSeatCount = rounds - firstRound + 1
  return [
    attendeeSeats.length === expectedSeatCount ? 0 : 1,
    genderSpreadMax,
    tableGapMax,
    tableGapTotal,
    candidateNumber(attendee),
  ]
}

export function chooseTheRoomBadgeCandidate({
  attendees = [],
  seats = [],
  requestedGender,
  tableCount = 1,
  roundCount = 1,
  activeRound = 1,
}) {
  if (!CLAIMABLE_GENDERS.has(requestedGender)) return null
  const available = attendees
    .filter(attendee =>
      attendee?.included_in_schedule !== false
      && ["registered", "confirmed"].includes(attendee?.attendance_status || "registered")
      && attendee?.checked_in === false
    )
    .sort((left, right) => candidateNumber(left) - candidateNumber(right))
  if (!available.length) return null

  const exact = available.find(attendee => attendee.gender === requestedGender)
  if (exact) return { attendee: exact, reassigned: false }

  const ranked = available
    .filter(attendee => CLAIMABLE_GENDERS.has(attendee.gender))
    .map(attendee => ({
      attendee,
      score: reassignmentScore({ attendee, attendees, seats, requestedGender, tableCount, roundCount, activeRound }),
    }))
    .sort((left, right) => compareScore(left.score, right.score))
  return ranked.length ? { attendee: ranked[0].attendee, reassigned: true } : null
}
