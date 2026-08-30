import { isCurrentBalancedScoreSnapshot } from "../matching/balanced-compatibility.mjs"
import { EVENT3_TEST_MATCH_ID } from "./test-match-results.mjs"

const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`

function checkedRoster(participantNumbers) {
  const roster = participantNumbers.map(Number)
  if (roster.length < 4 || roster.length % 2 !== 0
    || roster.some(number => !Number.isInteger(number) || number <= 0 || number === 9999)
    || new Set(roster).size !== roster.length) {
    throw new Error("Prepared test algorithm requires an even, unique participant roster")
  }
  return roster
}

// Randomize once when preparing the test session. Augmenting paths avoid the
// greedy fallback that could silently pair an explicitly excluded participant.
export function choosePreparedTestPairs(profiles, exclusions = new Set(), random = Math.random) {
  const roster = checkedRoster(profiles.map(profile => profile.assigned_number))
  const shuffle = values => {
    const result = [...values]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }
  const males = shuffle(profiles.filter(profile => /^m/i.test(profile.gender || "")).map(profile => Number(profile.assigned_number)))
  const females = shuffle(profiles.filter(profile => /^f/i.test(profile.gender || "")).map(profile => Number(profile.assigned_number)))
  if (males.length !== females.length || males.length + females.length !== roster.length) {
    throw new Error("Prepared test algorithm requires a balanced male/female roster")
  }
  const candidates = new Map(males.map(male => [male, shuffle(females).filter(female => !exclusions.has(pairKey(male, female)))]))
  const femalePartners = new Map()
  const assign = (male, visited) => {
    for (const female of candidates.get(male)) {
      if (visited.has(female)) continue
      visited.add(female)
      if (!femalePartners.has(female) || assign(femalePartners.get(female), visited)) {
        femalePartners.set(female, male)
        return true
      }
    }
    return false
  }
  for (const male of males) {
    if (!assign(male, new Set())) throw new Error("The test roster cannot be paired without violating exclusions")
  }
  return [...femalePartners].map(([female, male]) => ({ a: Math.min(male, female), b: Math.max(male, female) }))
    .sort((left, right) => left.a - right.a || left.b - right.b)
}

export function validatePreparedTestAlgorithmRows(rows, { eventId, participantNumbers, exclusions = new Set() }) {
  const roster = checkedRoster(participantNumbers)
  if (!Number.isInteger(Number(eventId)) || Number(eventId) <= 0) throw new Error("A positive test event is required")
  if (!Array.isArray(rows) || rows.length !== roster.length / 2) {
    throw new Error("Prepared test algorithm is incomplete; prepare it before starting phase 3")
  }
  const rosterSet = new Set(roster)
  const used = new Set()
  return rows.map(row => {
    const a = Number(row.participant_a_number)
    const b = Number(row.participant_b_number)
    if (row.match_id !== EVENT3_TEST_MATCH_ID || Number(row.event_id) !== Number(eventId)
      || Number(row.round) !== 30 || row.match_type !== "individual"
      || !Number.isInteger(a) || !Number.isInteger(b) || a >= b
      || !rosterSet.has(a) || !rosterSet.has(b) || used.has(a) || used.has(b)) {
      throw new Error("Prepared test algorithm conflicts with the current participant roster")
    }
    if (exclusions.has(pairKey(a, b))) throw new Error(`Prepared test pair #${a} × #${b} is excluded; phase 3 was not changed`)
    if (row.compatibility_score === null || row.compatibility_score === undefined || row.compatibility_score === "") {
      throw new Error(`Prepared test pair #${a} × #${b} has no numeric compatibility score`)
    }
    const score = Number(row.compatibility_score)
    if (!isCurrentBalancedScoreSnapshot({
      modelVersion: row.score_model_version,
      contentHash: row.score_content_hash,
      snapshot: row.score_snapshot,
      persistedTotal: score,
    })) throw new Error(`Prepared test pair #${a} × #${b} has no complete current score snapshot`)
    used.add(a)
    used.add(b)
    return {
      a, b, score,
      provenance: {
        scoreModelVersion: row.score_model_version,
        scoreSnapshot: row.score_snapshot,
        scoreContentHash: row.score_content_hash,
        persistedScore: score,
      },
      testResult: row,
    }
  })
}
