const pairKey = (a, b) => {
  const left = Number(a)
  const right = Number(b)
  return left < right ? `${left}-${right}` : `${right}-${left}`
}

function canonicalPair(a, b) {
  const left = Number(a)
  const right = Number(b)
  return left < right ? [left, right] : [right, left]
}

function normalizeParticipantNumbers(values) {
  if (!Array.isArray(values)) throw new TypeError("participantNumbers must be an array")
  const numbers = values.map(Number)
  if (numbers.some(number => !Number.isInteger(number) || number <= 0)) {
    throw new TypeError("participantNumbers must contain positive integers")
  }
  if (new Set(numbers).size !== numbers.length) {
    throw new TypeError("participantNumbers must not contain duplicates")
  }
  return [...numbers].sort((a, b) => a - b)
}

function normalizeRankings(rankings, participantSet) {
  const result = new Map()
  const put = (rankerValue, rankedValue, rankValue) => {
    const ranker = Number(rankerValue)
    const ranked = Number(rankedValue)
    const rank = Number(rankValue)
    if (!participantSet.has(ranker) || !participantSet.has(ranked) || ranker === ranked) return
    if (!Number.isFinite(rank) || rank <= 0) return
    if (!result.has(ranker)) result.set(ranker, new Map())
    const ballot = result.get(ranker)
    const previous = ballot.get(ranked)
    if (previous == null || rank < previous) ballot.set(ranked, rank)
  }

  if (rankings instanceof Map) {
    for (const [ranker, ballot] of rankings) {
      if (ballot instanceof Map) {
        for (const [ranked, rank] of ballot) put(ranker, ranked, rank)
      } else if (Array.isArray(ballot)) {
        ballot.forEach((ranked, index) => put(ranker, ranked, index + 1))
      } else {
        throw new TypeError("Each rankings Map value must be an ordered array or a Map of ranks")
      }
    }
  } else if (Array.isArray(rankings)) {
    for (const row of rankings) {
      put(row?.ranker_number ?? row?.ranker, row?.ranked_number ?? row?.ranked, row?.rank)
    }
  } else {
    throw new TypeError("rankings must be participant ranking rows or a Map")
  }
  return result
}

function normalizeExcludedPairs(values = []) {
  const keys = new Set()
  const add = (a, b) => {
    const left = Number(a)
    const right = Number(b)
    if (Number.isInteger(left) && Number.isInteger(right) && left > 0 && right > 0 && left !== right) {
      keys.add(pairKey(left, right))
    }
  }

  for (const value of values instanceof Set ? values : values || []) {
    if (typeof value === "string") {
      const match = value.match(/^(\d+)-(\d+)$/)
      if (match) add(match[1], match[2])
    } else if (Array.isArray(value)) {
      add(value[0], value[1])
    } else if (value && typeof value === "object") {
      add(
        value.a ?? value.participant_a_number ?? value.participant1_number,
        value.b ?? value.participant_b_number ?? value.participant2_number,
      )
    }
  }
  return keys
}

function mutualEdges(participantNumbers, rankings, excludedPairKeys) {
  const edges = []
  for (let leftIndex = 0; leftIndex < participantNumbers.length; leftIndex++) {
    const a = participantNumbers[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < participantNumbers.length; rightIndex++) {
      const b = participantNumbers[rightIndex]
      if (excludedPairKeys.has(pairKey(a, b))) continue
      const aRank = rankings.get(a)?.get(b)
      const bRank = rankings.get(b)?.get(a)
      if (aRank == null || bRank == null) continue
      edges.push({
        a,
        b,
        aRank,
        bRank,
        worstRank: Math.max(aRank, bRank),
        rankSum: aRank + bRank,
        rankGap: Math.abs(aRank - bRank),
        key: pairKey(a, b),
      })
    }
  }
  edges.sort(compareMutualEdges)
  return edges
}

// A pair both rank highly beats a lopsided pair. Remaining ties use total rank,
// imbalance, then participant number, so database row order can never affect it.
export function compareMutualEdges(left, right) {
  return left.worstRank - right.worstRank
    || left.rankSum - right.rankSum
    || left.rankGap - right.rankGap
    || left.a - right.a
    || left.b - right.b
}

/**
 * Deterministic Edmonds blossom maximum-cardinality matching for a general
 * undirected graph. Edges are unweighted; callers control deterministic search
 * order by passing sorted vertex IDs and edges.
 */
export function maximumCardinalityMatching(vertexValues, edgeValues) {
  const vertices = normalizeParticipantNumbers(vertexValues)
  const indexByNumber = new Map(vertices.map((number, index) => [number, index]))
  const adjacency = Array.from({ length: vertices.length }, () => [])
  const seenEdges = new Set()
  for (const edge of edgeValues || []) {
    const [a, b] = canonicalPair(edge?.a ?? edge?.[0], edge?.b ?? edge?.[1])
    const aIndex = indexByNumber.get(a)
    const bIndex = indexByNumber.get(b)
    const key = pairKey(a, b)
    if (aIndex == null || bIndex == null || aIndex === bIndex || seenEdges.has(key)) continue
    seenEdges.add(key)
    adjacency[aIndex].push(bIndex)
    adjacency[bIndex].push(aIndex)
  }
  adjacency.forEach(neighbors => neighbors.sort((a, b) => vertices[a] - vertices[b]))

  const size = vertices.length
  const match = Array(size).fill(-1)
  const parent = Array(size).fill(-1)
  const base = Array.from({ length: size }, (_, index) => index)
  const used = Array(size).fill(false)
  const blossom = Array(size).fill(false)

  const lowestCommonAncestor = (firstValue, secondValue) => {
    const path = Array(size).fill(false)
    let first = firstValue
    let second = secondValue
    while (true) {
      first = base[first]
      path[first] = true
      if (match[first] === -1) break
      first = parent[match[first]]
    }
    while (true) {
      second = base[second]
      if (path[second]) return second
      second = parent[match[second]]
    }
  }

  const markBlossomPath = (vertexValue, blossomBase, childValue) => {
    let vertex = vertexValue
    let child = childValue
    while (base[vertex] !== blossomBase) {
      blossom[base[vertex]] = true
      blossom[base[match[vertex]]] = true
      parent[vertex] = child
      child = match[vertex]
      vertex = parent[match[vertex]]
    }
  }

  const findAugmentingPath = root => {
    used.fill(false)
    parent.fill(-1)
    for (let index = 0; index < size; index++) base[index] = index

    const queue = [root]
    let head = 0
    used[root] = true
    while (head < queue.length) {
      const vertex = queue[head++]
      for (const neighbor of adjacency[vertex]) {
        if (base[vertex] === base[neighbor] || match[vertex] === neighbor) continue
        if (neighbor === root || (match[neighbor] !== -1 && parent[match[neighbor]] !== -1)) {
          const blossomBase = lowestCommonAncestor(vertex, neighbor)
          blossom.fill(false)
          markBlossomPath(vertex, blossomBase, neighbor)
          markBlossomPath(neighbor, blossomBase, vertex)
          for (let index = 0; index < size; index++) {
            if (!blossom[base[index]]) continue
            base[index] = blossomBase
            if (!used[index]) {
              used[index] = true
              queue.push(index)
            }
          }
        } else if (parent[neighbor] === -1) {
          parent[neighbor] = vertex
          if (match[neighbor] === -1) {
            let current = neighbor
            while (current !== -1) {
              const previous = parent[current]
              const next = previous === -1 ? -1 : match[previous]
              match[current] = previous
              if (previous !== -1) match[previous] = current
              current = next
            }
            return true
          }
          const paired = match[neighbor]
          used[paired] = true
          queue.push(paired)
        }
      }
    }
    return false
  }

  for (let root = 0; root < size; root++) {
    if (match[root] === -1) findAugmentingPath(root)
  }

  const result = []
  for (let index = 0; index < size; index++) {
    if (match[index] > index) {
      const [a, b] = canonicalPair(vertices[index], vertices[match[index]])
      result.push({ a, b })
    }
  }
  return result.sort((left, right) => left.a - right.a || left.b - right.b)
}

function strongestMaximumCardinalityMatching(participantNumbers, edges) {
  const targetPairCount = maximumCardinalityMatching(participantNumbers, edges).length
  if (targetPairCount === 0) return []

  const forced = []
  const forcedParticipants = new Set()
  const rejected = new Set()

  // Lexicographic optimization over the quality-sorted edge list: include the
  // strongest edge whenever a maximum-cardinality completion still exists.
  for (const edge of edges) {
    if (forced.length === targetPairCount) break
    if (forcedParticipants.has(edge.a) || forcedParticipants.has(edge.b)) continue

    const candidateParticipants = new Set([...forcedParticipants, edge.a, edge.b])
    const residualVertices = participantNumbers.filter(number => !candidateParticipants.has(number))
    const residualEdges = edges.filter(candidate =>
      candidate.key !== edge.key
      && !rejected.has(candidate.key)
      && !candidateParticipants.has(candidate.a)
      && !candidateParticipants.has(candidate.b))
    const possiblePairCount = forced.length + 1
      + maximumCardinalityMatching(residualVertices, residualEdges).length

    if (possiblePairCount >= targetPairCount) {
      forced.push(edge)
      forcedParticipants.add(edge.a)
      forcedParticipants.add(edge.b)
    } else {
      rejected.add(edge.key)
    }
  }

  if (forced.length !== targetPairCount) {
    throw new Error("Could not complete the deterministic maximum-cardinality choice matching")
  }
  return forced.sort((left, right) => left.a - right.a || left.b - right.b)
}

/**
 * Build one one-to-one round from reciprocal ranking data.
 *
 * `rankings` accepts either the DB row shape
 * `{ ranker_number, ranked_number, rank }[]`, or a Map whose values are ordered
 * participant arrays / Maps of participant to rank. Only reciprocal entries are
 * candidates. Exclusions accept canonical `"a-b"` strings, `[a,b]`, or common
 * pair object shapes.
 */
export function buildMutualChoiceRound({ participantNumbers, rankings, excludedPairs = [] }) {
  const participants = normalizeParticipantNumbers(participantNumbers)
  const participantSet = new Set(participants)
  const normalizedRankings = normalizeRankings(rankings, participantSet)
  const excludedPairKeys = normalizeExcludedPairs(excludedPairs)
  const candidates = mutualEdges(participants, normalizedRankings, excludedPairKeys)
  const pairs = strongestMaximumCardinalityMatching(participants, candidates)
  const matched = new Set(pairs.flatMap(pair => [pair.a, pair.b]))

  return {
    pairs: pairs.map(({ key: _key, ...pair }) => pair),
    unmatched: participants.filter(number => !matched.has(number)),
    participantCount: participants.length,
    candidatePairCount: candidates.length,
    maximumPairCount: pairs.length,
  }
}

/**
 * Build consecutive choice rounds. Each completed pair becomes a hard
 * exclusion for every later round, so nobody can meet the same partner twice.
 */
export function buildMutualChoiceRounds({ participantNumbers, rankings, excludedPairs = [], roundCount }) {
  const normalizedRoundCount = Number(roundCount)
  if (!Number.isInteger(normalizedRoundCount) || normalizedRoundCount <= 0) {
    throw new TypeError("roundCount must be a positive integer")
  }

  const cumulativeExclusions = normalizeExcludedPairs(excludedPairs)
  const rounds = []
  for (let roundIndex = 0; roundIndex < normalizedRoundCount; roundIndex++) {
    const round = buildMutualChoiceRound({
      participantNumbers,
      rankings,
      excludedPairs: cumulativeExclusions,
    })
    rounds.push(round)
    for (const pair of round.pairs) cumulativeExclusions.add(pairKey(pair.a, pair.b))
  }
  return { rounds }
}

/** Preserve the original two-round result shape for existing callers. */
export function buildTwoMutualChoiceRounds({ participantNumbers, rankings, excludedPairs = [] }) {
  const { rounds: [round1, round2] } = buildMutualChoiceRounds({
    participantNumbers,
    rankings,
    excludedPairs,
    roundCount: 2,
  })
  return { round1, round2 }
}

/** Build all three one-to-one reciprocal choice matches for this edition. */
export function buildThreeMutualChoiceRounds({ participantNumbers, rankings, excludedPairs = [] }) {
  const { rounds: [round1, round2, round3] } = buildMutualChoiceRounds({
    participantNumbers,
    rankings,
    excludedPairs,
    roundCount: 3,
  })
  return { round1, round2, round3 }
}

/**
 * API-facing compatibility wrapper. The existing Event3 matching route already
 * builds a Map keyed by every eligible ranker, so that Map is the roster source.
 */
export function buildChoiceMatches(rankings, { exclusions = new Set() } = {}) {
  const participantNumbers = rankings instanceof Map
    ? [...rankings.keys()].map(Number)
    : [...new Set((rankings || []).map(row => Number(row?.ranker_number ?? row?.ranker))
      .filter(number => Number.isInteger(number) && number > 0))]
  const result = buildMutualChoiceRound({
    participantNumbers,
    rankings,
    excludedPairs: exclusions,
  })
  const matches = new Map()
  for (const pair of result.pairs) {
    matches.set(pair.a, pair.b)
    matches.set(pair.b, pair.a)
  }
  return { matches, pairs: result.pairs, unmatched: result.unmatched }
}

export { pairKey as event3ChoicePairKey }
