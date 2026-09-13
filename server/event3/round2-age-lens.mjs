import { event3CompatibilityPairKey } from "./round1-compatibility.mjs"

function mapValue(source, key) {
  if (source instanceof Map) return source.get(key)
  return source?.[key]
}

function finiteAge(value) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function profileAge(profile) {
  const survey = profile?.survey_data || {}
  return finiteAge(profile?.age)
    ?? finiteAge(survey?.answers?.age)
    ?? finiteAge(survey?.age)
}

export function participantAge(number, { ageMap = new Map(), profileMap = new Map() } = {}) {
  return finiteAge(mapValue(ageMap, Number(number))) ?? profileAge(mapValue(profileMap, Number(number)))
}

export function scoreRound2AgeGroup(group, {
  ageMap = new Map(),
  profileMap = new Map(),
  lockedPairsSet = new Set(),
} = {}) {
  const gaps = []
  let missingAgePairs = 0
  let lockedPairs = 0
  const ages = group.map(number => participantAge(number, { ageMap, profileMap }))

  for (let left = 0; left < group.length; left++) {
    for (let right = left + 1; right < group.length; right++) {
      if (lockedPairsSet?.has(event3CompatibilityPairKey(group[left], group[right]))) lockedPairs++
      if (ages[left] === null || ages[right] === null) missingAgePairs++
      else gaps.push(Math.abs(ages[left] - ages[right]))
    }
  }

  const ageCost = gaps.reduce((sum, gap) => sum + gap ** 2, 0)
  const averageAgeGap = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : null
  const rmsAgeGap = gaps.length ? Math.sqrt(ageCost / gaps.length) : null
  const knownAges = ages.filter(age => age !== null)

  return {
    // Round 2 is a distance objective: lower values are better and are shown
    // as years, rather than being converted into an arbitrary percentage.
    score: averageAgeGap,
    ageCost,
    averageAgeGap,
    rmsAgeGap,
    ageRange: knownAges.length > 1 ? Math.max(...knownAges) - Math.min(...knownAges) : null,
    knownAgePairs: gaps.length,
    missingAgePairs,
    lockedPairs,
  }
}

export function createRound2AgeGroupScorer(options = {}) {
  return group => scoreRound2AgeGroup(group, options)
}

export function round2TotalAgeCost(groups, options = {}) {
  return groups.reduce((sum, group) => sum + scoreRound2AgeGroup(group, options).ageCost, 0)
}
