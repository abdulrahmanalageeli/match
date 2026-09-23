import scale from './connection-score-scale.json' with { type: 'json' }
import {
  CONNECTION_COMPATIBILITY_VERSION,
  CONNECTION_QUESTION_COUNT,
  CONNECTION_FOCUS_COUNT,
  scoreConnectionPair,
} from './connection-compatibility.mjs'

export { CONNECTION_COMPATIBILITY_VERSION }
export const CONNECTION_SCORE_MEANING = 'relative-ranking-not-probability'
export const CONNECTION_CALIBRATION = 'events26-28-shared-connection-reference-percentile'
export const CONNECTION_SOURCE_ARTIFACT = 'b14be564cf25d5cfecbb88858a2e480f8bd8d32828a67a3a4be4136e3eeb021d'

const round = value => Math.round((value + Number.EPSILON) * 1e6) / 1e6
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value)
const close = (a, b) => isFiniteNumber(a) && isFiniteNumber(b) && Math.abs(a - b) <= 1e-6
const knots = scale.knots
if (scale.modelVersion !== CONNECTION_COMPATIBILITY_VERSION
  || scale.method !== 'piecewise-linear-midrank-rational-tails'
  || scale.provenance?.sourceModelSha256 !== CONNECTION_SOURCE_ARTIFACT
  || !isFiniteNumber(scale.tailScale) || scale.tailScale <= 0
  || !Array.isArray(knots) || knots.length < 2
  || knots.some((point, i) => !isFiniteNumber(point.x) || !isFiniteNumber(point.y)
    || point.y <= 0 || point.y >= 100
    || (i > 0 && (point.x <= knots[i - 1].x || point.y <= knots[i - 1].y)))) {
  throw new Error('Invalid or mismatched shared connection score scale')
}

/** A continuous relative index. No labels fit this mapping; it is not a probability. */
export function connectionUtilityToIndex(utility) {
  if (!isFiniteNumber(utility)) throw new TypeError('Connection utility must be finite')
  const first = knots[0]
  const last = knots.at(-1)
  if (utility < first.x) return first.y / (1 + (first.x - utility) / scale.tailScale)
  if (utility > last.x) return 100 - (100 - last.y) / (1 + (utility - last.x) / scale.tailScale)
  let low = 0
  let high = knots.length - 1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (knots[middle].x <= utility) low = middle
    else high = middle
  }
  const left = knots[low]
  const right = knots[high]
  return left.y + (right.y - left.y) * (utility - left.x) / (right.x - left.x)
}

function numberFor(participant) {
  const value = participant?.assigned_number ?? participant?.participant_number ?? participant?.id
  return value !== undefined && value !== null && Number.isFinite(Number(value)) ? Number(value) : null
}

export function calculateConnectionCompatibility(participantA, participantB) {
  const pair = scoreConnectionPair(participantA, participantB)
  const coverage = round(pair.evidence.bothAnswered / pair.evidence.questionCount)
  const direction = (source, target, utility) => Object.freeze({
    sourceParticipantNumber: numberFor(source),
    targetParticipantNumber: numberFor(target),
    rawUtility: utility,
    score: round(connectionUtilityToIndex(utility)),
    questionnaireCoverage: coverage,
    strongestDrivers: Object.freeze([]),
  })
  const aToB = direction(participantA, participantB, pair.rawAToB)
  const bToA = direction(participantB, participantA, pair.rawBToA)
  const totalScore = Math.min(aToB.score, bToA.score)
  return Object.freeze({
    scoreModelVersion: CONNECTION_COMPATIBILITY_VERSION,
    sourceArtifactSha256: CONNECTION_SOURCE_ARTIFACT,
    scoreMeaning: CONNECTION_SCORE_MEANING,
    totalScore,
    priorityScore: totalScore,
    rawMutualUtility: pair.rawMutual,
    aToB,
    bToA,
    evidence: Object.freeze({ ...pair.evidence }),
    calibration: CONNECTION_CALIBRATION,
    mutualFormula: 'minimum',
    personalHistoryApplied: false,
  })
}

/** Validate serialized arithmetic before trusting a cached current-model score. */
export function isConnectionCompatibilityPayload(value) {
  if (!value || value.scoreModelVersion !== CONNECTION_COMPATIBILITY_VERSION
    || value.sourceArtifactSha256 !== CONNECTION_SOURCE_ARTIFACT
    || value.scoreMeaning !== CONNECTION_SCORE_MEANING
    || value.calibration !== CONNECTION_CALIBRATION
    || value.mutualFormula !== 'minimum' || value.personalHistoryApplied !== false) return false
  const directions = [value.aToB, value.bToA]
  const evidence = value.evidence
  const countWithin = (count, maximum) => Number.isInteger(count) && count >= 0 && count <= maximum
  const validId = id => id === null || isFiniteNumber(id)
  if (!evidence || evidence.questionCount !== CONNECTION_QUESTION_COUNT
    || !countWithin(evidence.aAnswered, CONNECTION_QUESTION_COUNT)
    || !countWithin(evidence.bAnswered, CONNECTION_QUESTION_COUNT)
    || !countWithin(evidence.bothAnswered, Math.min(evidence.aAnswered, evidence.bAnswered))
    || evidence.bothAnswered < evidence.aAnswered + evidence.bAnswered - CONNECTION_QUESTION_COUNT
    || !countWithin(evidence.aFocusCount, CONNECTION_FOCUS_COUNT)
    || !countWithin(evidence.bFocusCount, CONNECTION_FOCUS_COUNT)
    || !countWithin(evidence.sharedFocusCount, Math.min(evidence.aFocusCount, evidence.bFocusCount))
    || evidence.sharedFocusCount < evidence.aFocusCount + evidence.bFocusCount - CONNECTION_FOCUS_COUNT) return false
  const coverage = round(evidence.bothAnswered / CONNECTION_QUESTION_COUNT)
  if (directions.some(direction => !direction || !isFiniteNumber(direction.rawUtility)
    || !isFiniteNumber(direction.score) || direction.score < 0 || direction.score > 100
    || !validId(direction.sourceParticipantNumber) || !validId(direction.targetParticipantNumber)
    || !close(direction.questionnaireCoverage, coverage)
    || !close(direction.score, round(connectionUtilityToIndex(direction.rawUtility))))) return false
  return value.aToB.sourceParticipantNumber === value.bToA.targetParticipantNumber
    && value.aToB.targetParticipantNumber === value.bToA.sourceParticipantNumber
    && close(value.totalScore, Math.min(...directions.map(direction => direction.score)))
    && close(value.priorityScore, value.totalScore)
    && close(value.rawMutualUtility, Math.min(...directions.map(direction => direction.rawUtility)))
}
