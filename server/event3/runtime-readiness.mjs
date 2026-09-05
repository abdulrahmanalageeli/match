const GROUP_ROUNDS = Object.freeze([1, 2, 3])
const CLASSIC_GROUP_ROUNDS = Object.freeze([1, 2])

function normalizedRoster(participantNumbers) {
  return [...new Set((participantNumbers || []).map(Number).filter(number => Number.isInteger(number) && number > 0))]
}

function seatingRoundCoverage(roster, rosterSet, assignments, round) {
  const rows = (assignments || []).filter(row => Number(row.round) === round)
  const counts = new Map()
  let outsideRoster = 0
  for (const row of rows) {
    const number = Number(row.participant_id)
    if (!rosterSet.has(number)) {
      outsideRoster += 1
      continue
    }
    counts.set(number, (counts.get(number) || 0) + 1)
  }
  const covered = roster.filter(number => counts.get(number) === 1).length
  const duplicateAssignments = [...counts.values()].filter(count => count > 1).length
  return {
    round,
    covered,
    expected: roster.length,
    assignment_count: rows.length,
    duplicate_assignments: duplicateAssignments,
    outside_roster: outsideRoster,
    complete: roster.length > 0
      && covered === roster.length
      && rows.length === roster.length
      && duplicateAssignments === 0
      && outsideRoster === 0,
  }
}

function hasPartnerValue(value) {
  return value !== null && value !== undefined && value !== ""
}

function classicMatchSlotReadiness(roster, rosterSet, assignments, matches, field, assignmentRound) {
  const byParticipant = new Map()
  let duplicateRows = 0
  let outsideRosterRows = 0
  for (const row of matches || []) {
    const participant = Number(row.participant_number)
    if (!rosterSet.has(participant)) {
      if (hasPartnerValue(row[field])) outsideRosterRows += 1
      continue
    }
    if (byParticipant.has(participant)) {
      duplicateRows += 1
      continue
    }
    byParticipant.set(participant, row[field])
  }

  const populated = new Set()
  const reciprocal = new Set()
  let invalidPartners = 0
  let nonreciprocalPartners = 0
  for (const participant of roster) {
    const rawPartner = byParticipant.get(participant)
    if (!hasPartnerValue(rawPartner)) continue
    populated.add(participant)
    const partner = Number(rawPartner)
    if (!Number.isInteger(partner) || !rosterSet.has(partner) || partner === participant) {
      invalidPartners += 1
      continue
    }
    if (Number(byParticipant.get(partner)) !== participant) {
      nonreciprocalPartners += 1
      continue
    }
    reciprocal.add(participant)
  }

  const assignmentRows = (assignments || []).filter(row => Number(row.round) === assignmentRound)
  const assignmentsByParticipant = new Map()
  let outsideRosterAssignments = 0
  let invalidTables = 0
  for (const row of assignmentRows) {
    const participant = Number(row.participant_id)
    if (!rosterSet.has(participant)) {
      outsideRosterAssignments += 1
      continue
    }
    const rows = assignmentsByParticipant.get(participant) || []
    rows.push(row)
    assignmentsByParticipant.set(participant, rows)
    const table = Number(row.table_number)
    if (!Number.isInteger(table) || table <= 0) invalidTables += 1
  }

  let missingAssignments = 0
  let duplicateAssignments = 0
  let unmatchedAssignments = 0
  let exactAssignments = 0
  for (const participant of roster) {
    const count = assignmentsByParticipant.get(participant)?.length || 0
    if (reciprocal.has(participant)) {
      if (count === 0) missingAssignments += 1
      if (count > 1) duplicateAssignments += 1
      if (count === 1) exactAssignments += 1
    } else if (count > 0) {
      unmatchedAssignments += 1
    }
  }

  let mismatchedPairTables = 0
  const checkedPairs = new Set()
  for (const participant of reciprocal) {
    const partner = Number(byParticipant.get(participant))
    const pairKey = participant < partner ? `${participant}:${partner}` : `${partner}:${participant}`
    if (checkedPairs.has(pairKey)) continue
    checkedPairs.add(pairKey)
    const participantRows = assignmentsByParticipant.get(participant) || []
    const partnerRows = assignmentsByParticipant.get(partner) || []
    if (participantRows.length === 1
        && partnerRows.length === 1
        && Number(participantRows[0].table_number) !== Number(partnerRows[0].table_number)) {
      mismatchedPairTables += 1
    }
  }

  const assignmentsComplete = reciprocal.size > 0
    && assignmentRows.length === reciprocal.size
    && missingAssignments === 0
    && duplicateAssignments === 0
    && unmatchedAssignments === 0
    && outsideRosterAssignments === 0
    && invalidTables === 0
    && mismatchedPairTables === 0

  return {
    field,
    assignment_round: assignmentRound,
    covered: reciprocal.size,
    expected: roster.length,
    populated: populated.size,
    matched: reciprocal.size,
    unmatched: roster.length - reciprocal.size,
    pairs: reciprocal.size / 2,
    duplicate_rows: duplicateRows,
    outside_roster_rows: outsideRosterRows,
    invalid_partners: invalidPartners,
    nonreciprocal_partners: nonreciprocalPartners,
    assignments: {
      complete: assignmentsComplete,
      covered: exactAssignments,
      expected: reciprocal.size,
      assignment_count: assignmentRows.length,
      missing_assignments: missingAssignments,
      duplicate_assignments: duplicateAssignments,
      unmatched_assignments: unmatchedAssignments,
      outside_roster: outsideRosterAssignments,
      invalid_tables: invalidTables,
      mismatched_pair_tables: mismatchedPairTables,
    },
    complete: reciprocal.size > 0
      && populated.size === reciprocal.size
      && duplicateRows === 0
      && outsideRosterRows === 0
      && invalidPartners === 0
      && nonreciprocalPartners === 0
      && assignmentsComplete,
  }
}

export function buildEvent3RuntimeReadiness({ participantNumbers, assignments = [], matches = [], includePhase4 = false }) {
  const roster = normalizedRoster(participantNumbers)
  const rosterSet = new Set(roster)
  const seatingRounds = GROUP_ROUNDS.map(round => seatingRoundCoverage(roster, rosterSet, assignments, round))
  return {
    participant_count: roster.length,
    seating: {
      complete: seatingRounds.every(round => round.complete),
      rounds: seatingRounds,
    },
    phase2: classicMatchSlotReadiness(roster, rosterSet, assignments, matches, "phase2_partner", 20),
    phase3: classicMatchSlotReadiness(roster, rosterSet, assignments, matches, "phase3_partner", 30),
    phase4: includePhase4
      ? classicMatchSlotReadiness(roster, rosterSet, assignments, matches, "phase4_partner", 40)
      : { covered: 0, expected: 0, pairs: 0, expected_pairs: 0, duplicate_rows: 0, complete: false },
  }
}

export function buildEvent3ClassicRuntimeReadiness({ participantNumbers, assignments = [], matches = [] }) {
  const roster = normalizedRoster(participantNumbers)
  const rosterSet = new Set(roster)
  const seatingRounds = CLASSIC_GROUP_ROUNDS.map(round => seatingRoundCoverage(roster, rosterSet, assignments, round))
  return {
    participant_count: roster.length,
    seating: {
      complete: seatingRounds.every(round => round.complete),
      rounds: seatingRounds,
    },
    phase2: classicMatchSlotReadiness(roster, rosterSet, assignments, matches, "phase2_partner", 20),
    phase3: classicMatchSlotReadiness(roster, rosterSet, assignments, matches, "phase3_partner", 30),
    phase4: { covered: 0, expected: 0, pairs: 0, expected_pairs: 0, duplicate_rows: 0, complete: false },
  }
}
