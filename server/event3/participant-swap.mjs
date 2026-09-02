const CLASSIC_TABLE_ROUNDS = new Set([1, 2, 20, 30])
const CHOICE_ONLY_TABLE_ROUNDS = new Set([1, 2, 3, 20, 30])

export function swapNumber(value, oldParticipant, newParticipant, swapBoth = true) {
  const number = Number(value)
  if (!Number.isFinite(number)) return value ?? null
  if (number === oldParticipant) return newParticipant
  if (swapBoth && number === newParticipant) return oldParticipant
  return number
}

export function getTableSwapRounds(round, { choiceOnly = false } = {}) {
  const normalizedRound = Number(round)
  const validRounds = choiceOnly ? CHOICE_ONLY_TABLE_ROUNDS : CLASSIC_TABLE_ROUNDS
  if (!validRounds.has(normalizedRound)) return null
  if (![1, 2, 3].includes(normalizedRound)) return [normalizedRound]
  return choiceOnly ? [1, 2, 3] : [1, 2]
}

export function collectEventSwapPairs(matchRows, oldParticipant, newParticipant, swapBoth) {
  const pairs = []
  const seen = new Set()

  for (const row of matchRows || []) {
    for (const phase of ["phase2", "phase3"]) {
      const partnerField = `${phase}_partner`
      const originalParticipant = Number(row?.participant_number)
      const originalPartner = Number(row?.[partnerField])
      if (!Number.isInteger(originalParticipant) || !Number.isInteger(originalPartner) || originalPartner <= 0) continue
      if (![originalParticipant, originalPartner].some(number => number === oldParticipant || number === newParticipant)) continue

      const participant = swapNumber(originalParticipant, oldParticipant, newParticipant, swapBoth)
      const partner = swapNumber(originalPartner, oldParticipant, newParticipant, swapBoth)
      if (!Number.isInteger(participant) || !Number.isInteger(partner) || participant <= 0 || partner <= 0 || participant === partner) continue

      const a = Math.min(participant, partner)
      const b = Math.max(participant, partner)
      const key = `${phase}:${a}-${b}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ phase, a, b })
    }
  }

  return pairs
}

export function collectMatchResultSwapPairs(rows, oldParticipant, newParticipant) {
  const pairs = []
  for (const row of rows || []) {
    const originalA = Number(row?.participant_a_number)
    const originalB = Number(row?.participant_b_number)
    if (!row?.id || !Number.isInteger(originalA) || !Number.isInteger(originalB)) continue
    if (row?.participant_c_number != null || originalA === 9999 || originalB === 9999) continue
    if (![originalA, originalB].some(number => number === oldParticipant || number === newParticipant)) continue

    const a = swapNumber(originalA, oldParticipant, newParticipant, true)
    const b = swapNumber(originalB, oldParticipant, newParticipant, true)
    if (a === b) continue
    pairs.push({ id: row.id, a, b })
  }
  return pairs
}
