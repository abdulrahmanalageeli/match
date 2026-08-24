const SUPPORTED_GENDERS = new Set(["male", "female", "nonbinary", "unspecified"])
const GENDER_FAIRNESS_WORK_BUDGET = 250000

// Certified 6-table social-golfer design for the common 30-person, 4-round
// event. Template IDs 0-14 and 15-29 are the two equally sized gender pools.
// It has no repeated pair, every table is split 2/3, and each pool's
// opposite-gender exposure is the theoretical optimum: six people meet 9 and
// nine people meet 10 across the four rounds.
const BALANCED_THIRTY_PERSON_TEMPLATE = [
  [[13, 4, 20, 19, 24], [3, 1, 17, 23, 26], [14, 7, 15, 16, 29], [11, 9, 8, 25, 22], [12, 6, 2, 18, 28], [0, 5, 10, 27, 21]],
  [[8, 6, 17, 19, 27], [0, 7, 18, 20, 25], [9, 14, 28, 26, 21], [11, 10, 4, 16, 23], [5, 3, 12, 29, 24], [13, 1, 2, 22, 15]],
  [[5, 2, 25, 19, 16], [9, 12, 23, 15, 27], [3, 10, 22, 20, 28], [0, 4, 6, 26, 29], [1, 8, 14, 18, 24], [13, 7, 11, 21, 17]],
  [[4, 5, 18, 22, 17], [0, 11, 28, 15, 24], [8, 2, 29, 21, 23], [6, 9, 1, 16, 20], [13, 14, 3, 25, 27], [12, 10, 7, 19, 26]],
]

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

function buildCertifiedGenderBalancedRounds(participants, tableCount, roundCount, seed) {
  if (participants.length !== 30 || tableCount !== 6 || roundCount !== 4) return null
  const pools = [...new Set(participants.map(person => person.gender))]
    .sort()
    .map(gender => participants.filter(person => person.gender === gender))
  if (pools.length !== 2 || pools.some(pool => pool.length !== 15)) return null

  const random = createRandom(`${seed}:certified-gender-balance`)
  const templatePeople = [...shuffled(pools[0], random), ...shuffled(pools[1], random)]
  return BALANCED_THIRTY_PERSON_TEMPLATE.map(round =>
    round.map(table => table.map(templateId => templatePeople[templateId])),
  )
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

function calculateGenderExposureMetrics(schedule) {
  const people = new Map(schedule.participants.map(person => [person.id, person]))
  const genders = [...new Set(schedule.participants.map(person => person.gender))].sort()
  const exposure = new Map(schedule.participants.map(person => [
    person.id,
    Object.fromEntries(genders.map(gender => [gender, 0])),
  ]))
  let prefixSpreadMax = 0

  const measure = () => {
    let spreadMax = 0
    let oppositeSpreadMax = 0
    let deviationMax = 0
    let squaredDeviation = 0
    for (const attendeeGender of genders) {
      const cohort = schedule.participants.filter(person => person.gender === attendeeGender)
      if (!cohort.length) continue
      for (const companionGender of genders) {
        const values = cohort.map(person => exposure.get(person.id)?.[companionGender] || 0)
        const average = values.reduce((sum, value) => sum + value, 0) / values.length
        const spread = Math.max(...values) - Math.min(...values)
        spreadMax = Math.max(spreadMax, spread)
        if (attendeeGender !== companionGender) oppositeSpreadMax = Math.max(oppositeSpreadMax, spread)
        for (const value of values) {
          const deviation = Math.abs(value - average)
          deviationMax = Math.max(deviationMax, deviation)
          squaredDeviation += deviation ** 2
        }
      }
    }
    return { spreadMax, oppositeSpreadMax, deviationMax, squaredDeviation }
  }

  for (const round of schedule.rounds) {
    for (const table of round.tables) {
      for (const attendeeId of table.attendeeIds) {
        const counts = exposure.get(attendeeId)
        if (!counts) continue
        for (const companionId of table.attendeeIds) {
          if (companionId === attendeeId) continue
          const companion = people.get(companionId)
          if (companion) counts[companion.gender] = (counts[companion.gender] || 0) + 1
        }
      }
    }
    prefixSpreadMax = Math.max(prefixSpreadMax, measure().spreadMax)
  }

  const final = measure()
  return {
    genderExposureSpreadMax: final.spreadMax,
    genderExposurePrefixSpreadMax: prefixSpreadMax,
    oppositeGenderExposureSpreadMax: final.oppositeSpreadMax,
    maxGenderExposureDeviation: Number(final.deviationMax.toFixed(2)),
    genderExposureSquaredDeviation: Number(final.squaredDeviation.toFixed(2)),
  }
}

function compareGenderExposureMetrics(left, right) {
  const leftScore = [left.genderExposureSpreadMax, left.genderExposurePrefixSpreadMax, left.genderExposureSquaredDeviation]
  const rightScore = [right.genderExposureSpreadMax, right.genderExposurePrefixSpreadMax, right.genderExposureSquaredDeviation]
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) return leftScore[index] - rightScore[index]
  }
  return 0
}

function cloneSchedule(schedule) {
  return {
    ...schedule,
    participants: schedule.participants.map(person => ({ ...person })),
    rounds: schedule.rounds.map(round => ({
      ...round,
      tables: round.tables.map(table => ({
        ...table,
        attendeeIds: [...table.attendeeIds],
        genderCounts: { ...table.genderCounts },
      })),
    })),
  }
}

function improveGenderExposureWithSafeSwaps(schedule, { maxSwaps = 12, maxEvaluations = 4000 } = {}) {
  const baselineMetrics = calculateGenderExposureMetrics(schedule)
  const swapLimit = Math.max(0, Math.floor(Number(maxSwaps) || 0))
  const requestedEvaluationLimit = Math.max(0, Math.floor(Number(maxEvaluations) || 0))
  const scheduleSize = Math.max(1, schedule.participants.length * schedule.rounds.length)
  const sizeAwareEvaluationLimit = Math.max(1, Math.floor(GENDER_FAIRNESS_WORK_BUDGET / scheduleSize))
  const evaluationLimit = Math.min(requestedEvaluationLimit, sizeAwareEvaluationLimit)
  if (baselineMetrics.genderExposureSpreadMax <= 1 || swapLimit === 0 || evaluationLimit === 0) {
    return { schedule, metrics: baselineMetrics, swapCount: 0, evaluationCount: 0 }
  }

  const candidate = cloneSchedule(schedule)
  const people = new Map(candidate.participants.map(person => [person.id, person]))
  let currentMetrics = baselineMetrics
  let swapCount = 0
  let evaluationCount = 0

  while (swapCount < swapLimit && evaluationCount < evaluationLimit) {
    let bestMove = null
    let bestMetrics = currentMetrics

    search:
    for (let roundIndex = 0; roundIndex < candidate.rounds.length; roundIndex += 1) {
      const tables = candidate.rounds[roundIndex].tables
      for (let leftTableIndex = 0; leftTableIndex < tables.length; leftTableIndex += 1) {
        for (let rightTableIndex = leftTableIndex + 1; rightTableIndex < tables.length; rightTableIndex += 1) {
          const leftTable = tables[leftTableIndex]
          const rightTable = tables[rightTableIndex]
          if (leftTable.attendeeIds.length !== rightTable.attendeeIds.length) continue
          for (let leftSeatIndex = 0; leftSeatIndex < leftTable.attendeeIds.length; leftSeatIndex += 1) {
            const leftId = leftTable.attendeeIds[leftSeatIndex]
            for (let rightSeatIndex = 0; rightSeatIndex < rightTable.attendeeIds.length; rightSeatIndex += 1) {
              const rightId = rightTable.attendeeIds[rightSeatIndex]
              if (people.get(leftId)?.gender !== people.get(rightId)?.gender) continue
              if (evaluationCount >= evaluationLimit) break search
              evaluationCount += 1

              leftTable.attendeeIds[leftSeatIndex] = rightId
              rightTable.attendeeIds[rightSeatIndex] = leftId
              const validation = validateTheRoomSchedule(candidate)
              if (validation.valid) {
                const metrics = calculateGenderExposureMetrics(candidate)
                if (compareGenderExposureMetrics(metrics, bestMetrics) < 0) {
                  bestMove = { roundIndex, leftTableIndex, rightTableIndex, leftSeatIndex, rightSeatIndex }
                  bestMetrics = metrics
                }
              }
              leftTable.attendeeIds[leftSeatIndex] = leftId
              rightTable.attendeeIds[rightSeatIndex] = rightId
            }
          }
        }
      }
    }

    if (!bestMove) break
    const leftTable = candidate.rounds[bestMove.roundIndex].tables[bestMove.leftTableIndex]
    const rightTable = candidate.rounds[bestMove.roundIndex].tables[bestMove.rightTableIndex]
    ;[leftTable.attendeeIds[bestMove.leftSeatIndex], rightTable.attendeeIds[bestMove.rightSeatIndex]] = [
      rightTable.attendeeIds[bestMove.rightSeatIndex],
      leftTable.attendeeIds[bestMove.leftSeatIndex],
    ]
    currentMetrics = bestMetrics
    swapCount += 1
    if (currentMetrics.genderExposureSpreadMax <= 1) break
  }

  const validation = validateTheRoomSchedule(candidate)
  if (!validation.valid || compareGenderExposureMetrics(currentMetrics, baselineMetrics) >= 0) {
    return { schedule, metrics: baselineMetrics, swapCount: 0, evaluationCount }
  }
  return { schedule: candidate, metrics: currentMetrics, swapCount, evaluationCount }
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
  optimizeGenderExposure = true,
  maxGenderFairnessSwaps = 12,
  maxGenderFairnessEvaluations = 4000,
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
  const certifiedGenderRounds = optimizeGenderExposure
    ? buildCertifiedGenderBalancedRounds(normalizedParticipants, tables, rounds, seed)
    : null
  const affineRounds = certifiedGenderRounds || buildAffineRounds(normalizedParticipants, tables, rounds, seed)

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

  const baselineSchedule = {
    participants: normalizedParticipants.map(({ id, name, gender }) => ({ id, name, gender })),
    tableCount: tables,
    roundCount: rounds,
    rounds: generatedRounds,
  }
  const improvement = optimizeGenderExposure
    ? improveGenderExposureWithSafeSwaps(baselineSchedule, {
        maxSwaps: maxGenderFairnessSwaps,
        maxEvaluations: maxGenderFairnessEvaluations,
      })
    : {
        schedule: baselineSchedule,
        metrics: calculateGenderExposureMetrics(baselineSchedule),
        swapCount: 0,
        evaluationCount: 0,
      }
  const schedule = improvement.schedule
  const validation = validateTheRoomSchedule(schedule)
  if (!validation.valid) throw new TheRoomScheduleError("Generated schedule failed validation", "VALIDATION_FAILED", validation)

  const meetingValues = [...meetingCounts.values()]
  const exposureMetrics = improvement.metrics
  const genderSpreads = schedule.rounds.flatMap(round => {
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
      ...exposureMetrics,
      genderFairnessTargetMet: exposureMetrics.genderExposureSpreadMax <= 1 ? 1 : 0,
      genderFairnessOptimizationApplied: (certifiedGenderRounds || improvement.swapCount > 0) ? 1 : 0,
      genderFairnessFallbackUsed: optimizeGenderExposure && exposureMetrics.genderExposureSpreadMax > 1 ? 1 : 0,
      genderFairnessOptimalityCertified: certifiedGenderRounds ? 1 : 0,
      genderFairnessSafeSwapCount: improvement.swapCount,
      genderFairnessEvaluationCount: improvement.evaluationCount,
    },
  }
}
