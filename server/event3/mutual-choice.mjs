import { normalizedGender } from "./round2-age-optimizer.mjs"

export const MUTUAL_CHOICE_ROUNDS = 6
const pairKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`

function shuffled(values, seed) {
  const result = [...values]
  let state = seed >>> 0 || 1
  for (let i = result.length - 1; i > 0; i--) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    const j = (state >>> 0) % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function encounterCounts(history) {
  const tables = new Map()
  for (const seat of history) {
    if (seat.kind === "break" || seat.table_number == null) continue
    const key = `${seat.round_number}:${seat.table_number}`
    if (!tables.has(key)) tables.set(key, new Set())
    tables.get(key).add(Number(seat.participant_number))
  }
  const counts = new Map()
  for (const table of tables.values()) {
    const members = [...table]
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = pairKey(members[i], members[j])
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
  }
  return counts
}

function balancedGroups(pool, participants, history, round) {
  if (pool.length < 3) return []
  const count = Math.ceil(pool.length / 6)
  const sizes = Array.from({ length: count }, (_, i) => Math.floor(pool.length / count) + (i < pool.length % count ? 1 : 0))
  const gender = new Map(participants.map(p => [p.participant_number, normalizedGender(p.gender)]))
  const categories = ["male", "female", "unknown"]
  const totals = categories.map(category => pool.filter(n => gender.get(n) === category).length)
  const encounters = encounterCounts(history)
  const cost = group => {
    let score = 0
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) score += 10 * (encounters.get(pairKey(group[i], group[j])) || 0) ** 2
    }
    // Keep the available gender mix evenly distributed, without assuming an even roster.
    categories.forEach((category, index) => {
      const actual = group.filter(n => gender.get(n) === category).length
      score += 24 * (actual - group.length * totals[index] / pool.length) ** 2
    })
    return score
  }
  let best = null
  let bestCost = Infinity
  for (let attempt = 0; attempt < 16; attempt++) {
    const order = shuffled(pool, round * 104729 + attempt * 7919 + pool.reduce((sum, n) => sum + n, 0))
    let offset = 0
    const groups = sizes.map(size => { const group = order.slice(offset, offset + size); offset += size; return group })
    // A small bounded swap pass improves both new introductions and gender balance.
    for (let pass = 0; pass < 4; pass++) {
      let improved = false
      for (let a = 0; a < groups.length; a++) {
        for (let b = a + 1; b < groups.length; b++) {
          for (let i = 0; i < groups[a].length; i++) {
            for (let j = 0; j < groups[b].length; j++) {
              const before = cost(groups[a]) + cost(groups[b])
              ;[groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]]
              if (cost(groups[a]) + cost(groups[b]) < before - 0.001) improved = true
              else [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]]
            }
          }
        }
      }
      if (!improved) break
    }
    const score = groups.reduce((sum, group) => sum + cost(group), 0)
    if (score < bestCost) { best = groups; bestCost = score }
    if (score === 0) break
  }
  return best
}

/** A deterministic plan: each person has exactly one destination, and only mutual choices form pairs. */
export function buildMutualRound({ participants, previousAssignments = [], choices = [], history = [], round, initialAssignments = [] }) {
  if (!Number.isInteger(round) || round < 1 || round > MUTUAL_CHOICE_ROUNDS) throw new Error("Invalid mutual-choice round")
  const roster = participants.map(p => ({ ...p, participant_number: Number(p.participant_number) }))
  const numbers = roster.map(p => p.participant_number).sort((a, b) => a - b)
  if (numbers.length < 3 || numbers.some(n => !Number.isInteger(n) || n <= 0) || new Set(numbers).size !== numbers.length) {
    throw new Error("Mutual-choice rounds require a unique roster of at least three participants")
  }
  const active = new Set(numbers)
  const previous = new Map(previousAssignments.map(seat => [Number(seat.participant_number), seat]))
  const picks = new Map(choices.map(choice => [Number(choice.participant_number), Number(choice.chosen_number) || null]))
  const paired = new Set()
  const pairs = []
  if (round > 1) {
    for (const number of numbers) {
      const chosen = picks.get(number)
      if (!chosen || chosen === number || !active.has(chosen) || paired.has(number) || paired.has(chosen) || picks.get(chosen) !== number) continue
      const self = previous.get(number)
      const other = previous.get(chosen)
      if (self?.kind !== "group" || other?.kind !== "group" || self.group_number == null || self.group_number !== other.group_number) continue
      pairs.push([number, chosen])
      paired.add(number); paired.add(chosen)
    }
  }
  const pool = numbers.filter(number => !paired.has(number))
  let groups
  if (round === 1 && initialAssignments.length) {
    const existing = new Map()
    const seen = new Set()
    for (const seat of initialAssignments) {
      const number = Number(seat.participant_number)
      const table = Number(seat.table_number ?? seat.group_number)
      if (!active.has(number) || seen.has(number) || !Number.isInteger(table) || table < 1) throw new Error("Invalid initial group seating")
      seen.add(number)
      if (!existing.has(table)) existing.set(table, [])
      existing.get(table).push(number)
    }
    if (seen.size !== active.size || [...existing.values()].some(group => group.length < 3)) throw new Error("Initial seating must include everyone in groups of at least three")
    groups = [...existing.entries()].sort(([a], [b]) => a - b).map(([table, members]) => ({ table, members }))
  } else {
    groups = balancedGroups(pool, roster, history, round).map((members, index) => ({ table: index + 1, members }))
  }
  const result = groups.flatMap(({ table, members }) => members.map(participant_number => ({
    participant_number, kind: "group", table_number: table, group_number: table, partner_number: null,
  })))
  let table = Math.max(0, ...groups.map(group => group.table))
  for (const [a, b] of pairs) {
    table++
    result.push({ participant_number: a, kind: "pair", table_number: table, group_number: null, partner_number: b })
    result.push({ participant_number: b, kind: "pair", table_number: table, group_number: null, partner_number: a })
  }
  if (pool.length < 3) {
    result.push(...pool.map(participant_number => ({ participant_number, kind: "break", table_number: null, group_number: null, partner_number: null })))
  }
  return result.sort((a, b) => a.participant_number - b.participant_number)
}
