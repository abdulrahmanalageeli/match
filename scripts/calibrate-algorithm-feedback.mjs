import { readFileSync } from 'node:fs'
import {
  BALANCED_WEIGHTS,
  calculateBalancedCompatibility,
  getBalancedAnswer,
  normalizeBalancedChoice,
} from '../server/matching/balanced-compatibility.mjs'

const rows = JSON.parse(readFileSync(process.argv[2] || 0, 'utf8'))
const EPS = 1e-9
const questionKeys = Object.keys(BALANCED_WEIGHTS).filter(key => key !== 'vibe' && BALANCED_WEIGHTS[key] > 0)
const profileCriteria = ['expressionLanguage', 'religion', 'socialStyle']
const candidateKeys = [...new Set([...questionKeys, ...profileCriteria])]
const answerKeyByCriterion = {
  disagreement: 'match_disagreement_style', similarityPreference: 'match_similarity_preference', currentFocus: 'match_current_focus',
  humorBanter: 'humor_banter_style', earlyOpenness: 'early_openness_comfort', initiative: 'conversation_initiative_preference',
  expressionLanguage: 'expression_language', religion: 'minimum_partner_religious_commitment', socialStyle: 'social_relationship_style',
  attachment1: 'attachment_1', attachment3: 'attachment_3', attachment4: 'attachment_4',
  lifestyle1: 'lifestyle_1', lifestyle2: 'lifestyle_2', lifestyle3: 'lifestyle_3', lifestyle4: 'lifestyle_4', lifestyle5: 'lifestyle_5',
  core1: 'core_values_1', core2: 'core_values_2', core4: 'core_values_4', core5: 'core_values_5',
  communication1: 'communication_1', communication2: 'communication_2', communication3: 'communication_3', communication4: 'communication_4', communication5: 'communication_5',
  conversationDepth: 'conversation_depth_pref', socialBattery: 'social_battery', humorSubtype: 'humor_subtype', curiosityStyle: 'curiosity_style',
  intent: 'intent_goal', silence: 'silence_comfort',
}
const PREVIOUS_WEIGHTS = {
  disagreement: 5,
  similarityPreference: 2,
  currentFocus: 4,
  humorBanter: 6,
  earlyOpenness: 4,
  initiative: 6,
  expressionLanguage: 4,
  religion: 4,
  socialStyle: 4,
  attachment1: 2,
  attachment3: 3,
  attachment4: 3,
  lifestyle1: 2,
  lifestyle2: 3,
  lifestyle3: 3,
  lifestyle4: 2,
  lifestyle5: 2,
  core1: 1,
  core2: 1,
  core3: 0,
  core4: 2,
  core5: 1,
  communication1: 1,
  communication2: 1,
  communication3: 1,
  communication4: 1,
  communication5: 1,
  conversationDepth: 3,
  socialBattery: 2,
  humorSubtype: 3,
  curiosityStyle: 4,
  intent: 5,
  silence: 2,
  vibe: 12,
}

function auc(items, scoreKey = 'score') {
  const valid = items.filter(item => Number.isFinite(item[scoreKey]) && (item.y === 0 || item.y === 1))
  const positives = valid.filter(item => item.y === 1)
  const negatives = valid.filter(item => item.y === 0)
  if (!positives.length || !negatives.length) return null
  let wins = 0
  for (const p of positives) for (const n of negatives) wins += p[scoreKey] > n[scoreKey] ? 1 : p[scoreKey] === n[scoreKey] ? 0.5 : 0
  return wins / (positives.length * negatives.length)
}

function pearson(items, scoreKey = 'score', outcomeKey = 'rating') {
  const valid = items.filter(item => Number.isFinite(item[scoreKey]) && Number.isFinite(item[outcomeKey]))
  if (valid.length < 3) return null
  const mx = valid.reduce((s, r) => s + r[scoreKey], 0) / valid.length
  const my = valid.reduce((s, r) => s + r[outcomeKey], 0) / valid.length
  let xy = 0, xx = 0, yy = 0
  for (const r of valid) { const x = r[scoreKey] - mx; const y = r[outcomeKey] - my; xy += x * y; xx += x * x; yy += y * y }
  return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : null
}

function observed(a, b, criterion) {
  const key = answerKeyByCriterion[criterion]
  return key && getBalancedAnswer(a, key) != null && getBalancedAnswer(b, key) != null
}

function transform(a, b, criterion, kind) {
  const key = answerKeyByCriterion[criterion]
  const av = normalizeBalancedChoice(getBalancedAnswer(a, key))
  const bv = normalizeBalancedChoice(getBalancedAnswer(b, key))
  if (!av || !bv) return null
  if (kind === 'equal') return av === bv ? 1 : 0
  const an = Number(av), bn = Number(bv)
  if (kind === 'close' && Number.isFinite(an) && Number.isFinite(bn)) return 1 - Math.min(Math.abs(an - bn), 4) / 4
  if (kind === 'complement' && Number.isFinite(an) && Number.isFinite(bn)) return Math.min(Math.abs(an - bn), 4) / 4
  return null
}

const data = rows.map(row => {
  const current = calculateBalancedCompatibility(row.a, row.b, { vibeScore: 6 })
  const features = {}
  for (const key of questionKeys) features[key] = current.questionScores[key] / BALANCED_WEIGHTS[key]
  return {
    ...row,
    y: row.wantConnect === true ? 1 : row.wantConnect === false ? 0 : null,
    rating: Number(row.compatibilityRate),
    current: current.totalScore,
    eventTimeExact: Boolean(row.a_updated_at && row.b_updated_at && row.outcome_proxy_at)
      && new Date(row.a_updated_at) <= new Date(row.outcome_proxy_at)
      && new Date(row.b_updated_at) <= new Date(row.outcome_proxy_at),
    features,
    observed: Object.fromEntries(questionKeys.map(key => [key, observed(row.a, row.b, key)])),
  }
}).filter(row => row.y === 0 || row.y === 1)

function previousRemovedFit(row, criterion) {
  const key = answerKeyByCriterion[criterion]
  const a = Number(getBalancedAnswer(row.a, key))
  const b = Number(getBalancedAnswer(row.b, key))
  if (criterion === 'socialStyle') {
    if (![1, 2, 3, 4].includes(a) || ![1, 2, 3, 4].includes(b)) return 0.5
    return [1, 0.75, 0.35, 0.1][Math.abs(a - b)]
  }
  if (criterion === 'expressionLanguage') {
    const matrix = [
      [1, 0.9, 0.75, 0.45, 0],
      [0.9, 1, 0.9, 0.7, 0.35],
      [0.75, 0.9, 1, 0.9, 0.75],
      [0.45, 0.7, 0.9, 1, 0.9],
      [0, 0.35, 0.75, 0.9, 1],
    ]
    return matrix[a - 1]?.[b - 1] ?? 0.5
  }
  if (criterion === 'religion') {
    const matrix = [
      [1, 0.7, 0.25, 0.1],
      [0.7, 1, 0.65, 0.4],
      [0.25, 0.65, 1, 0.8],
      [0.1, 0.4, 0.8, 1],
    ]
    return matrix[a - 1]?.[b - 1] ?? 0.5
  }
  return 0.5
}

// Train-only transformation selection. Event 26 is never consulted here.
const train = data.filter(row => row.eventTimeExact && row.event_id >= 21 && row.event_id <= 25 && row.participant_number !== 7 && row.participant_number !== 1778 && row.phase3_partner !== 7 && row.phase3_partner !== 1778)
const holdout = data.filter(row => row.eventTimeExact && row.event_id === 26 && row.participant_number !== 7 && row.participant_number !== 1778 && row.phase3_partner !== 7 && row.phase3_partner !== 1778)

const transforms = {}
for (const criterion of questionKeys) {
  const candidates = ['current', 'equal', 'close', 'complement'].map(kind => {
    const scored = train.map(row => ({ ...row, score: kind === 'current' ? row.features[criterion] : transform(row.a, row.b, criterion, kind) }))
    const coverage = scored.filter(row => Number.isFinite(row.score)).length
    return { kind, coverage, trainAuc: auc(scored) }
  }).filter(item => item.coverage >= Math.max(24, train.length * 0.25) && item.trainAuc != null)
  candidates.sort((a, b) => Math.abs(b.trainAuc - 0.5) - Math.abs(a.trainAuc - 0.5) || b.coverage - a.coverage)
  transforms[criterion] = candidates[0]?.kind || 'current'
}

function featureValue(row, criterion) {
  if (row.featureVector) return row.featureVector[criterion]
  const kind = transforms[criterion]
  const value = kind === 'current' ? row.features[criterion] : transform(row.a, row.b, criterion, kind)
  return Number.isFinite(value) ? value : 0.5
}

for (const row of data) {
  row.featureVector = Object.fromEntries(questionKeys.map(key => {
    const kind = transforms[key]
    const value = kind === 'current' ? row.features[key] : transform(row.a, row.b, key, kind)
    return [key, Number.isFinite(value) ? value : 0.5]
  }))
  row.previous = 6 + Object.entries(PREVIOUS_WEIGHTS).reduce((sum, [key, weight]) => {
    if (key === 'vibe') return sum
    const fit = key in row.features ? row.features[key] : previousRemovedFit(row, key)
    return sum + weight * fit
  }, 0)
}

function sigmoid(z) { return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)) }

function fitNonnegativeLogistic(trainingRows, keys, lambda) {
  const n = trainingRows.length
  const means = Object.fromEntries(keys.map(key => [key, trainingRows.reduce((s, r) => s + featureValue(r, key), 0) / n]))
  const scales = Object.fromEntries(keys.map(key => {
    const variance = trainingRows.reduce((s, r) => s + (featureValue(r, key) - means[key]) ** 2, 0) / n
    return [key, Math.sqrt(variance) || 1]
  }))
  const weights = Object.fromEntries(keys.map(key => [key, 0]))
  let intercept = Math.log((trainingRows.reduce((s, r) => s + r.y, 0) + 0.5) / (trainingRows.reduce((s, r) => s + 1 - r.y, 0) + 0.5))
  for (let iteration = 0; iteration < 1200; iteration++) {
    const gradients = Object.fromEntries(keys.map(key => [key, 0]))
    let gb = 0
    for (const row of trainingRows) {
      let z = intercept
      for (const key of keys) z += weights[key] * ((featureValue(row, key) - means[key]) / scales[key])
      const error = sigmoid(z) - row.y
      gb += error
      for (const key of keys) gradients[key] += error * ((featureValue(row, key) - means[key]) / scales[key])
    }
    const rate = 0.08 / Math.sqrt(1 + iteration / 100)
    intercept -= rate * gb / n
    for (const key of keys) weights[key] = Math.max(0, weights[key] - rate * (gradients[key] / n + lambda * weights[key]))
  }
  return { weights, means, scales, intercept }
}

function predict(row, model) {
  let z = model.intercept
  for (const key of Object.keys(model.weights)) z += model.weights[key] * ((featureValue(row, key) - model.means[key]) / model.scales[key])
  return sigmoid(z)
}

const lambdas = [0.03, 0.1, 0.3, 1, 3]
const cv = []
for (const lambda of lambdas) {
  const foldAucs = []
  for (const eventId of [21, 22, 23, 24, 25]) {
    const foldTrain = train.filter(row => row.event_id !== eventId)
    const foldTest = train.filter(row => row.event_id === eventId)
    const model = fitNonnegativeLogistic(foldTrain, questionKeys, lambda)
    foldAucs.push(auc(foldTest.map(row => ({ ...row, score: predict(row, model) }))))
  }
  cv.push({ lambda, foldAucs, macroAuc: foldAucs.filter(Number.isFinite).reduce((a, b) => a + b, 0) / foldAucs.filter(Number.isFinite).length })
}
cv.sort((a, b) => b.macroAuc - a.macroAuc)
const model = fitNonnegativeLogistic(train, questionKeys, cv[0].lambda)

// Convert positive coefficients into a readable 88-point question budget; keep the production 12-point vibe budget unchanged.
const rawImportance = Object.fromEntries(questionKeys.map(key => [key, model.weights[key] / model.scales[key]]))
const active = Object.entries(rawImportance).filter(([, value]) => value > EPS).sort((a, b) => b[1] - a[1])
const importanceTotal = active.reduce((s, [, value]) => s + value, 0) || 1
const proposedWeights = Object.fromEntries(questionKeys.map(key => [key, 0]))
for (const [key, value] of active) proposedWeights[key] = 88 * value / importanceTotal

function proposedScore(row) {
  return 6 + questionKeys.reduce((sum, key) => sum + proposedWeights[key] * featureValue(row, key), 0)
}

const scoreRows = cohort => cohort.map(row => ({ ...row, score: proposedScore(row) }))
const currentRows = cohort => cohort.map(row => ({ ...row, score: row.previous }))
const byEvent = [21,22,23,24,25,26].map(eventId => {
  const cohort = data.filter(row => row.event_id === eventId && row.participant_number !== 1778 && row.phase3_partner !== 1778)
  return { eventId, n: cohort.length, yes: cohort.filter(r => r.y === 1).length, currentAuc: auc(currentRows(cohort)), proposedAuc: auc(scoreRows(cohort)), currentRatingR: pearson(currentRows(cohort)), proposedRatingR: pearson(scoreRows(cohort)) }
})

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6D2B79F5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
function pairBootstrap(cohort, scoredRows, iterations = 5000) {
  const groups = new Map()
  for (const row of cohort) {
    const key = [row.participant_number, row.phase3_partner].sort((a, b) => a - b).join('-')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const pairs = [...groups.values()]
  const random = mulberry32(20260902)
  const samples = []
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sampled = []
    for (let index = 0; index < pairs.length; index++) sampled.push(...pairs[Math.floor(random() * pairs.length)])
    const before = auc(currentRows(sampled))
    const after = auc(scoredRows(sampled))
    if (before != null && after != null) samples.push({ before, after, difference: after - before })
  }
  const interval = key => {
    const values = samples.map(sample => sample[key]).sort((a, b) => a - b)
    return [values[Math.floor(values.length * 0.025)], values[Math.floor(values.length * 0.975)]]
  }
  return {
    pairClusters: pairs.length,
    validIterations: samples.length,
    pointCurrent: auc(currentRows(cohort)),
    pointAfter: auc(scoredRows(cohort)),
    current95: interval('before'),
    after95: interval('after'),
    difference95: interval('difference'),
  }
}
// Interpretation-first candidate: keep the three profile dimensions as alignment
// signals, emphasize the event-25/26 questions, and reduce redundant/weak items.
const evidenceWeights = {
  disagreement: 4,
  similarityPreference: 1,
  currentFocus: 4,
  humorBanter: 4,
  earlyOpenness: 3,
  initiative: 4,
  expressionLanguage: 4,
  religion: 5,
  socialStyle: 3,
  attachment1: 4,
  attachment3: 3,
  attachment4: 2,
  lifestyle1: 2,
  lifestyle2: 3,
  lifestyle3: 2,
  lifestyle4: 4,
  lifestyle5: 1,
  core1: 1,
  core2: 1,
  core3: 0,
  core4: 2,
  core5: 1,
  communication1: 1,
  communication2: 1,
  communication3: 0.5,
  communication4: 1,
  communication5: 0.5,
  conversationDepth: 2,
  socialBattery: 4,
  humorSubtype: 4,
  curiosityStyle: 8,
  intent: 5,
  silence: 3,
  vibe: 12,
}
if (Object.values(evidenceWeights).reduce((sum, value) => sum + value, 0) !== 100) throw new Error('evidence weights must total 100')
function evidenceFit(row, key) {
  return key in row.features ? row.features[key] : previousRemovedFit(row, key)
}
function evidenceRawScore(row) {
  return 6 + candidateKeys.reduce((sum, key) => sum + evidenceWeights[key] * evidenceFit(row, key), 0)
}
function evidenceScore(row) {
  // A neutral/missing answer is baseline evidence, not 50 points of compatibility.
  return Math.max(0, Math.min(100, (evidenceRawScore(row) - 50) * 2))
}
const evidenceRows = cohort => cohort.map(row => ({ ...row, score: evidenceScore(row) }))
const evidenceByEvent = [21,22,23,24,25,26].map(eventId => {
  const cohort = data.filter(row => row.event_id === eventId && row.participant_number !== 1778 && row.phase3_partner !== 1778)
  const exact = cohort.filter(row => row.eventTimeExact)
  return {
    eventId, n: cohort.length, exactN: exact.length,
    beforeAuc: auc(currentRows(cohort)), afterAuc: auc(evidenceRows(cohort)),
    exactBeforeAuc: auc(currentRows(exact)), exactAfterAuc: auc(evidenceRows(exact)),
    beforeRatingR: pearson(currentRows(cohort)), afterRatingR: pearson(evidenceRows(cohort)),
  }
})
const evidenceUseCases = holdout.map(row => ({
  eventId: row.event_id, participant: row.participant_number, partner: row.phase3_partner, label: row.y, rating: row.rating,
  before: row.previous, after: evidenceScore(row), rawAfter: evidenceRawScore(row), delta: evidenceScore(row) - row.previous,
})).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
function outcomeMeans(cohort, scoreForRow) {
  const mean = rows => rows.reduce((sum, row) => sum + scoreForRow(row), 0) / rows.length
  const positives = cohort.filter(row => row.y === 1)
  const negatives = cohort.filter(row => row.y === 0)
  return { positive: mean(positives), negative: mean(negatives), gap: mean(positives) - mean(negatives) }
}

function mutualPairRows(cohort, scoreForRow) {
  const groups = new Map()
  for (const row of cohort) {
    const key = [row.participant_number, row.phase3_partner].sort((a, b) => a - b).join('-')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.entries()].filter(([, directions]) => directions.length >= 2).map(([pair, directions]) => ({
    pair,
    y: directions.every(row => row.y === 1) ? 1 : 0,
    score: scoreForRow(directions[0]),
    directions: directions.length,
  }))
}

const perQuestion = questionKeys.map(key => {
  const trainScored = train.map(row => ({ ...row, score: featureValue(row, key) }))
  const holdoutScored = holdout.map(row => ({ ...row, score: featureValue(row, key) }))
  return { key, transform: transforms[key], weightBefore: BALANCED_WEIGHTS[key], weightAfter: proposedWeights[key], trainAuc: auc(trainScored), event26Auc: auc(holdoutScored), event25Coverage: train.filter(r => r.event_id === 25 && r.observed[key]).length, event26Coverage: holdout.filter(r => r.observed[key]).length }
}).sort((a, b) => b.weightAfter - a.weightAfter)

const useCaseCandidates = holdout.map(row => ({
  eventId: row.event_id, participant: row.participant_number, partner: row.phase3_partner, label: row.y,
  rating: row.rating, before: row.current, after: proposedScore(row), delta: proposedScore(row) - row.current,
})).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
console.log(JSON.stringify({
  provenance: { rows: data.length, trainN: train.length, holdoutN: holdout.length, trainYes: train.filter(r => r.y === 1).length, holdoutYes: holdout.filter(r => r.y === 1).length },
  selectedLambda: cv[0], cv,
  overall: {
    trainCurrentAuc: auc(currentRows(train)), trainProposedAuc: auc(scoreRows(train)),
    holdoutCurrentAuc: auc(currentRows(holdout)), holdoutProposedAuc: auc(scoreRows(holdout)),
    trainCurrentRatingR: pearson(currentRows(train)), trainProposedRatingR: pearson(scoreRows(train)),
    holdoutCurrentRatingR: pearson(currentRows(holdout)), holdoutProposedRatingR: pearson(scoreRows(holdout)),
  },
  byEvent, evidence: {
    weights: evidenceWeights,
    trainBeforeAuc: auc(currentRows(train)), trainAfterAuc: auc(evidenceRows(train)),
    holdoutBeforeAuc: auc(currentRows(holdout)), holdoutAfterAuc: auc(evidenceRows(holdout)),
    trainBeforeRatingR: pearson(currentRows(train)), trainAfterRatingR: pearson(evidenceRows(train)),
    holdoutBeforeRatingR: pearson(currentRows(holdout)), holdoutAfterRatingR: pearson(evidenceRows(holdout)),
    holdoutOutcomeMeans: {
      before: outcomeMeans(holdout, row => row.previous),
      after: outcomeMeans(holdout, evidenceScore),
    },
    holdoutPairBootstrap: pairBootstrap(holdout, evidenceRows),
    holdoutMutual: {
      pairs: mutualPairRows(holdout, row => row.previous).length,
      mutualPairs: mutualPairRows(holdout, row => row.previous).filter(row => row.y === 1).length,
      beforeAuc: auc(mutualPairRows(holdout, row => row.previous)),
      afterAuc: auc(mutualPairRows(holdout, evidenceScore)),
    },
    profileDiagnostics: profileCriteria.map(key => ({
      key,
      trainAuc: auc(train.map(row => ({ ...row, score: evidenceFit(row, key) }))),
      holdoutAuc: auc(holdout.map(row => ({ ...row, score: evidenceFit(row, key) }))),
    })),
    byEvent: evidenceByEvent,
    useCases: evidenceUseCases.slice(0, 12),
    strongestPositiveExamples: evidenceUseCases.filter(row => row.label === 1).sort((a, b) => b.after - a.after).slice(0, 5),
    strongestNegativeExamples: evidenceUseCases.filter(row => row.label === 0).sort((a, b) => a.after - b.after).slice(0, 5),
  }, perQuestion, useCases: useCaseCandidates.slice(0, 8),
}, null, 2))
