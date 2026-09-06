const MAX_EVENT3_ROUND3_ASSIGNMENTS = 100

function assignmentRows(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVENT3_ROUND3_ASSIGNMENTS) {
    throw new TypeError(`${label} must be a non-empty assignment array`)
  }

  const participants = new Set()
  const rows = value.map((row, index) => {
    const participantId = Number(row?.participant_id)
    const tableNumber = Number(row?.table_number)
    if (!Number.isInteger(participantId) || participantId <= 0 || participantId === 9999) {
      throw new TypeError(`${label}[${index}].participant_id is invalid`)
    }
    if (!Number.isInteger(tableNumber) || tableNumber <= 0 || tableNumber > 99) {
      throw new TypeError(`${label}[${index}].table_number must be between 1 and 99`)
    }
    if (participants.has(participantId)) {
      throw new TypeError(`${label} contains participant #${participantId} more than once`)
    }
    participants.add(participantId)
    return { participant_id: participantId, table_number: tableNumber }
  })

  return rows.sort((left, right) => left.participant_id - right.participant_id)
}

export function normalizeEvent3Round3ApplyRequest(body = {}) {
  const expectedRound1Assignments = assignmentRows(
    body.expected_round1_assignments,
    "expected_round1_assignments",
  )
  const expectedRound2Assignments = assignmentRows(
    body.expected_round2_assignments,
    "expected_round2_assignments",
  )
  const expectedAssignments = assignmentRows(body.expected_assignments, "expected_assignments")
  const assignments = assignmentRows(body.assignments, "assignments")
  const frozenTable = Number(body.frozen_table)
  if (!Number.isInteger(frozenTable) || frozenTable <= 0 || frozenTable > 99) {
    throw new TypeError("frozen_table must be between 1 and 99")
  }
  if (assignments.length !== expectedAssignments.length) {
    throw new TypeError("assignments must contain the complete expected Round-3 roster")
  }

  const expectedParticipants = new Set(expectedAssignments.map(row => row.participant_id))
  for (const [label, rows] of [
    ["expected_round1_assignments", expectedRound1Assignments],
    ["expected_round2_assignments", expectedRound2Assignments],
    ["assignments", assignments],
  ]) {
    if (rows.length !== expectedAssignments.length
      || rows.some(row => !expectedParticipants.has(row.participant_id))) {
      throw new TypeError(`${label} must contain exactly the expected Round-3 participants`)
    }
  }

  return {
    expectedRound1Assignments,
    expectedRound2Assignments,
    expectedAssignments,
    assignments,
    frozenTable,
  }
}
