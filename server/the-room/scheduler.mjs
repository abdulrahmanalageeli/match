const SUPPORTED_GENDERS = new Set(["male", "female", "nonbinary", "unspecified"])

export class TheRoomScheduleError extends Error {
  constructor(message, code = "INVALID_SCHEDULE_INPUT", details = {}) {
    super(message)
    this.name = "TheRoomScheduleError"
    this.code = code
    this.details = details
  }
}

function normalizeGender(value) {
  const normalized = String(value || "unspecified").trim().toLowerCase()
  if (["m", "man", "ذكر"].includes(normalized)) return "male"
  if (["f", "woman", "أنثى", "انثى"].includes(normalized)) return "female"
  if (["non-binary", "non_binary", "other"].includes(normalized)) return "nonbinary"
  return SUPPORTED_GENDERS.has(normalized) ? normalized : "unspecified"
}

function hashSeed(value) {
  let hash = 2166136261
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createRandom(seedValue) {
  let state = hashSeed(seedValue) || 0x9e3779b9
  return () => {
    state += 0x6d2b79f5
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled(values, random) {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function pairKey(left, right) {
  const a = String(left)
  const b = String(right)
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
}

function tableCapacities(participantCount, tableCount, roundIndex) {
  const base = Math.floor(participantCount / tableCount)
  const remainder = participantCount % tableCount
  return Array.from({ length: tableCount }, (_, tableIndex) =>
    base + (((tableIndex + roundIndex) % tableCount) < remainder ? 1 : 0)
  )
}

function isPrime(value) {
  if (value < 2) return false
  for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
    if (value % divisor === 0) return false
  }
  return true
}

function createGenderTargets(participants, capacities, random) {
  const genders = [...new Set(participants.map(person => person.gender))].sort()
  const totals = Object.fromEntries(genders.map(gender => [
    gender,
    participants.filter(person => person.gender === gender).length,
  ]))
  const targets = capacities.map(() => Object.fromEntries(genders.map(gender => [gender, 0])))
  const remainingSeats = [...capacities]

  for (const gender of shuffled(genders, random).sort((a, b) => totals[b] - totals[a])) {
    for (let seat = 0; seat < totals[gender]; seat += 1) {
      const candidates = remainingSeats
        .map((remaining, tableIndex) => ({
          tableIndex,
          remaining,
          genderCount: targets[tableIndex][gender],
          fillRatio: (capacities[tableIndex] - remaining) / capacities[tableIndex],
          noise: random(),
        }))
        .filter(candidate => candidate.remaining > 0)
        .sort((left, right) =>
          left.genderCount - right.genderCount
          || left.fillRatio - right.fillRatio
          || left.noise - right.noise
        )

      if (!candidates.length) throw new TheRoomScheduleError("Gender target allocation ran out of seats")
      const chosen = candidates[0].tableIndex
      targets[chosen][gender] += 1
      remainingSeats[chosen] -= 1
    }
  }

  return targets
}

function buildFirstRound(participants, capacities, targets, random) {
  const tables = capacities.map(() => [])
  const byGender = new Map()
  for (const participant of participants) {
    if (!byGender.has(participant.gender)) byGender.set(participant.gender, [])
    byGender.get(participant.gender).push(participant)
  }

  for (const [gender, people] of byGender.entries()) {
    const queue = shuffled(people, random)
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      const target = targets[tableIndex][gender] || 0
      tables[tableIndex].push(...queue.splice(0, target))
    }
  }
  return tables.map(table => shuffled(table, random))
}

function buildAffineRounds(participants, tableCount, roundCount, seed, maxAttempts = 2400) {
  if (!isPrime(tableCount) || participants.length % tableCount !== 0 || roundCount > tableCount) return null
  const capacity = participants.length / tableCount
  if (capacity > tableCount) return null
  const capacities = Array(tableCount).fill(capacity)
  const genders = [...new Set(participants.map(person => person.gender))]

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const random = createRandom(`${seed}:affine:${attempt}`)
    const targets = createGenderTargets(participants, capacities, random)
    const baseTables = buildFirstRound(participants, capacities, targets, random)
    const rounds = [baseTables]

    for (let roundIndex = 1; roundIndex < roundCount; roundIndex += 1) {
      const roundTables = Array.from({ length: tableCount }, () => [])
      for (let groupIndex = 0; groupIndex < baseTables.length; groupIndex += 1) {
        baseTables[groupIndex].forEach((person, position) => {
          roundTables[(groupIndex + roundIndex * position) % tableCount].push(person)
        })
      }
      rounds.push(roundTables)
    }

    const genderSpread = Math.max(0, ...rounds.flatMap(roundTables => genders.map(gender => {
      const counts = roundTables.map(table => table.filter(person => person.gender === gender).length)
      return Math.max(...counts) - Math.min(...counts)
    })))
    if (genderSpread <= 1) return rounds
  }
  return null
}

function solveRound(participants, capacities, targets, metPairs, random, nodeLimit) {
  const tables = capacities.map(() => [])
  const genderCounts = targets.map(target => Object.fromEntries(Object.keys(target).map(gender => [gender, 0])))
  const unassigned = new Map(participants.map(person => [person.id, person]))
  let visitedNodes = 0

  const feasibleTables = participant => tables
    .map((table, tableIndex) => ({ table, tableIndex }))
    .filter(({ table, tableIndex }) =>
      table.length < capacities[tableIndex]
      && genderCounts[tableIndex][participant.gender] < (targets[tableIndex][participant.gender] || 0)
      && table.every(seated => !metPairs.has(pairKey(participant.id, seated.id)))
    )
    .map(({ tableIndex }) => tableIndex)

  const search = () => {
    visitedNodes += 1
    if (visitedNodes > nodeLimit) return false
    if (unassigned.size === 0) return true

    let selected = null
    let selectedCandidates = null
    const candidatesByPerson = []
    for (const participant of unassigned.values()) {
      const candidates = feasibleTables(participant)
      if (!candidates.length) return false
      candidatesByPerson.push({ participant, candidates, noise: random() })
    }
    candidatesByPerson.sort((left, right) =>
      left.candidates.length - right.candidates.length
      || right.participant.metCount - left.participant.metCount
      || left.noise - right.noise
    )
    selected = candidatesByPerson[0].participant
    selectedCandidates = candidatesByPerson[0].candidates

    const scoredTables = selectedCandidates.map(tableIndex => {
      const table = tables[tableIndex]
      let futureSlack = 0
      for (const other of unassigned.values()) {
        if (other.id === selected.id) continue
        if (metPairs.has(pairKey(selected.id, other.id))) continue
        const otherGenderRoom = genderCounts[tableIndex][other.gender] < (targets[tableIndex][other.gender] || 0)
        if (otherGenderRoom && table.every(seated => !metPairs.has(pairKey(other.id, seated.id)))) futureSlack += 1
      }
      return {
        tableIndex,
        futureSlack,
        fillRatio: table.length / capacities[tableIndex],
        noise: random(),
      }
    }).sort((left, right) =>
      right.futureSlack - left.futureSlack
      || right.fillRatio - left.fillRatio
      || left.noise - right.noise
    )

    const emptySignatures = new Set()
    for (const { tableIndex } of scoredTables) {
      if (tables[tableIndex].length === 0) {
        const signature = JSON.stringify(targets[tableIndex])
        if (emptySignatures.has(signature)) continue
        emptySignatures.add(signature)
      }

      tables[tableIndex].push(selected)
      genderCounts[tableIndex][selected.gender] += 1
      unassigned.delete(selected.id)
      if (search()) return true
      unassigned.set(selected.id, selected)
      genderCounts[tableIndex][selected.gender] -= 1
      tables[tableIndex].pop()
    }
    return false
  }

  return search() ? tables : null
}

function addRoundPairs(tables, metPairs, meetingCounts) {
  for (const table of tables) {
    for (let leftIndex = 0; leftIndex < table.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < table.length; rightIndex += 1) {
        const left = table[leftIndex]
        const right = table[rightIndex]
        metPairs.add(pairKey(left.id, right.id))
        meetingCounts.set(left.id, (meetingCounts.get(left.id) || 0) + 1)
        meetingCounts.set(right.id, (meetingCounts.get(right.id) || 0) + 1)
      }
    }
  }
}

export function validateTheRoomSchedule(schedule) {
  const seenPairs = new Set()
  const repeatedPairs = []
  const attendanceErrors = []
  const expectedIds = new Set(schedule.participants.map(person => person.id))

  for (const round of schedule.rounds) {
    const roundIds = new Set()
    for (const table of round.tables) {
      for (const attendeeId of table.attendeeIds) {
        if (roundIds.has(attendeeId)) attendanceErrors.push(`Round ${round.roundNumber}: duplicate attendee ${attendeeId}`)
        roundIds.add(attendeeId)
      }
      for (let leftIndex = 0; leftIndex < table.attendeeIds.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < table.attendeeIds.length; rightIndex += 1) {
          const key = pairKey(table.attendeeIds[leftIndex], table.attendeeIds[rightIndex])
          if (seenPairs.has(key)) repeatedPairs.push(key)
          seenPairs.add(key)
        }
      }
    }
    if (roundIds.size !== expectedIds.size || [...expectedIds].some(id => !roundIds.has(id))) {
      attendanceErrors.push(`Round ${round.roundNumber}: attendee set is incomplete`)
    }
  }

  return {
    valid: repeatedPairs.length === 0 && attendanceErrors.length === 0,
    repeatedPairs,
    attendanceErrors,
    uniquePairCount: seenPairs.size,
  }
}

export function generateTheRoomSchedule({
  participants,
  tableCount,
  roundCount,
  minimumAttendees = 0,
  seed = "the-room",
  maxAttemptsPerRound = 160,
  nodeLimit = 120000,
}) {
  const normalizedParticipants = (participants || []).map((participant, index) => ({
    id: String(participant?.id ?? participant?.attendee_id ?? index + 1),
    name: String(participant?.name || participant?.full_name || `Guest ${index + 1}`),
    gender: normalizeGender(participant?.gender),
    original: participant,
    metCount: 0,
  }))
  const count = normalizedParticipants.length
  const tables = Number(tableCount)
  const rounds = Number(roundCount)
  const minimum = Number(minimumAttendees || 0)

  if (!Number.isInteger(tables) || tables < 1) throw new TheRoomScheduleError("Table count must be a positive integer")
  if (!Number.isInteger(rounds) || rounds < 1) throw new TheRoomScheduleError("Round count must be a positive integer")
  if (new Set(normalizedParticipants.map(person => person.id)).size !== count) throw new TheRoomScheduleError("Attendee IDs must be unique")
  if (count < minimum) throw new TheRoomScheduleError(`At least ${minimum} attendees are required`, "MINIMUM_NOT_MET", { minimum, count })
  if (count < tables * 2) throw new TheRoomScheduleError("Each table needs at least two attendees", "TOO_MANY_TABLES", { tableCount: tables, count })

  const largestTable = Math.ceil(count / tables)
  if (rounds > 1 && largestTable > tables) {
    throw new TheRoomScheduleError(
      "A repeat-free second round needs at least as many tables as the largest table has guests. Add tables or attendees, or use one round.",
      "TABLE_GEOMETRY_IMPOSSIBLE",
      { count, tableCount: tables, roundCount: rounds, largestTable },
    )
  }
  const pairsPerRound = tableCapacities(count, tables, 0)
    .reduce((total, capacity) => total + (capacity * (capacity - 1)) / 2, 0)
  const requiredMeetingPairs = rounds * pairsPerRound
  const availableMeetingPairs = (count * (count - 1)) / 2
  if (requiredMeetingPairs > availableMeetingPairs) {
    throw new TheRoomScheduleError(
      "This many rounds and tables would force at least one repeated meeting. Add attendees, add tables, or reduce rounds.",
      "PAIR_CAPACITY_EXCEEDED",
      { count, tableCount: tables, roundCount: rounds, requiredMeetingPairs, availableMeetingPairs },
    )
  }

  const metPairs = new Set()
  const meetingCounts = new Map(normalizedParticipants.map(person => [person.id, 0]))
  const generatedRounds = []
  const affineRounds = buildAffineRounds(normalizedParticipants, tables, rounds, seed)

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const capacities = tableCapacities(count, tables, roundIndex)
    let solvedTables = null
    let attemptUsed = 0

    if (affineRounds) {
      solvedTables = affineRounds[roundIndex]
      attemptUsed = 1
    } else {
      for (let attempt = 0; attempt < maxAttemptsPerRound && !solvedTables; attempt += 1) {
        attemptUsed = attempt + 1
        const random = createRandom(`${seed}:${roundIndex}:${attempt}`)
        const targets = createGenderTargets(normalizedParticipants, capacities, random)
        solvedTables = roundIndex === 0
          ? buildFirstRound(normalizedParticipants, capacities, targets, random)
          : solveRound(normalizedParticipants, capacities, targets, metPairs, random, nodeLimit)
      }
    }

    if (!solvedTables) {
      throw new TheRoomScheduleError(
        `No repeat-free plan was found for round ${roundIndex + 1}. Try another table count or fewer rounds.`,
        "NO_VALID_SCHEDULE",
        { failedRound: roundIndex + 1, attempts: maxAttemptsPerRound },
      )
    }

    addRoundPairs(solvedTables, metPairs, meetingCounts)
    normalizedParticipants.forEach(person => { person.metCount = meetingCounts.get(person.id) || 0 })
    generatedRounds.push({
      roundNumber: roundIndex + 1,
      attempts: attemptUsed,
      tables: solvedTables.map((table, tableIndex) => ({
        tableNumber: tableIndex + 1,
        attendeeIds: table.map(person => person.id),
        genderCounts: table.reduce((counts, person) => ({ ...counts, [person.gender]: (counts[person.gender] || 0) + 1 }), {}),
      })),
    })
  }

  const schedule = {
    participants: normalizedParticipants.map(({ id, name, gender }) => ({ id, name, gender })),
    tableCount: tables,
    roundCount: rounds,
    rounds: generatedRounds,
  }
  const validation = validateTheRoomSchedule(schedule)
  if (!validation.valid) throw new TheRoomScheduleError("Generated schedule failed validation", "VALIDATION_FAILED", validation)

  const meetingValues = [...meetingCounts.values()]
  const genderSpreads = generatedRounds.flatMap(round => {
    const genders = [...new Set(normalizedParticipants.map(person => person.gender))]
    return genders.map(gender => {
      const values = round.tables.map(table => table.genderCounts[gender] || 0)
      return Math.max(...values) - Math.min(...values)
    })
  })

  return {
    ...schedule,
    metrics: {
      repeatPairCount: 0,
      uniquePairCount: validation.uniquePairCount,
      genderSpreadMax: genderSpreads.length ? Math.max(...genderSpreads) : 0,
      minMeetingsPerAttendee: Math.min(...meetingValues),
      maxMeetingsPerAttendee: Math.max(...meetingValues),
      averageMeetingsPerAttendee: Number((meetingValues.reduce((sum, value) => sum + value, 0) / meetingValues.length).toFixed(2)),
    },
  }
}
