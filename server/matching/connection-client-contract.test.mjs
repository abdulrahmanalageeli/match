import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../../app/lib/compatibility-model.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const client = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

function calculation({ a = 80, b = 60, chemistry = 'high' } = {}) {
  const ready = chemistry !== 'pending'
  const ratio = chemistry === 'high' ? 1 : chemistry === 'neutral' ? 0.6 : 0
  const suggested = chemistry === 'high' ? 12 : chemistry === 'low' ? -8 : 0
  const personalized = {
    scoreModelVersion: client.CURRENT_BALANCED_SCORE_MODEL,
    calibration: 'events26-28-shared-connection-reference-percentile',
    scoreMeaning: 'relative-ranking-not-probability',
    mutualFormula: 'minimum',
    sourceArtifactSha256: client.CURRENT_BALANCED_SOURCE_ARTIFACT,
    personalHistoryApplied: false,
    totalScore: Math.min(a, b),
    priorityScore: Math.min(a, b),
    rawMutualUtility: 0.6,
    aToB: { score: a, rawUtility: 0.8 },
    bToA: { score: b, rawUtility: 0.6 },
  }
  return {
    scoreModelVersion: client.CURRENT_BALANCED_SCORE_MODEL,
    totalScore: personalized.totalScore,
    scoreBreakdown: {
      scoringMethod: 'shared-connection-survey-only',
      personalized,
      personalizedBase: personalized.totalScore,
      aiChemistryApplied: false,
      aiChemistrySuggestedAdjustment: suggested,
      aiChemistryAdjustment: 0,
      aiChemistryReady: ready,
      aiChemistryBand: chemistry,
      aiChemistryScore: ready ? ratio : null,
      finalScore: personalized.totalScore,
    },
    vibeAxes: ready ? {
      current_curiosity: { score: 5 * ratio, confidence: 1 },
      hobbies: { score: 3 * ratio, confidence: 1 },
    } : {},
    questionScores: {},
  }
}

function persisted(result, storedTotal = result.totalScore) {
  return {
    score_model_version: result.scoreModelVersion,
    compatibility_score: storedTotal,
    score_content_hash: 'event-time-content',
    score_snapshot: {
      ...structuredClone(result),
      totalScore: storedTotal,
      combinedContentHash: 'event-time-content',
      vibeModel: client.CURRENT_BALANCED_VIBE_MODEL,
      vibeModelVersion: client.CURRENT_BALANCED_VIBE_VERSION,
      vibeModelTag: client.CURRENT_BALANCED_VIBE_TAG,
    },
  }
}

test('the client uses the lower directional index with diagnostic-only AI bands', () => {
  for (const chemistry of ['high', 'neutral', 'low', 'pending']) {
    const result = calculation({ chemistry })
    assert.equal(client.isCurrentBalancedScoreRow(result), true, chemistry)
    assert.equal(client.personalizedCompatibilityForDisplay(result).totalScore, 60)
    const diagnostic = client.aiChemistryForDisplay(result)
    assert.equal(diagnostic.band, chemistry)
    assert.equal(diagnostic.adjustment, 0)
    assert.equal(diagnostic.applied, false)
    assert.equal(diagnostic.finalScore, 60)
  }
})

test('obsolete formulas, applied AI, invalid utility, and inaccurate score meanings fail closed', () => {
  const mutations = [
    row => { row.scoreBreakdown.personalized.mutualFormula = 'geometric-mean' },
    row => { row.scoreBreakdown.personalized.totalScore = Math.sqrt(80 * 60) },
    row => { row.scoreBreakdown.personalized.scoreMeaning = 'probability' },
    row => { row.scoreBreakdown.personalized.calibration = 'events26-27-archetype-ranking-percentile' },
    row => { row.scoreBreakdown.personalized.aToB.rawUtility = NaN },
    row => { row.scoreBreakdown.personalized.aToB.score = null },
    row => { row.scoreBreakdown.personalized.personalHistoryApplied = true },
    row => { row.scoreBreakdown.personalized.sourceArtifactSha256 = 'different-model' },
    row => { row.scoreBreakdown.personalized.rawMutualUtility = 0.8 },
    row => { row.scoreBreakdown.personalized.priorityScore = 80 },
    row => { row.scoreBreakdown.scoringMethod = 'archetype-ai' },
    row => { row.scoreBreakdown.aiChemistryApplied = true },
    row => { row.scoreBreakdown.aiChemistryAdjustment = 12 },
    row => { row.scoreBreakdown.aiChemistrySuggestedAdjustment = 0 },
    row => { row.scoreBreakdown.finalScore = 72; row.totalScore = 72 },
  ]
  for (const mutate of mutations) {
    const result = calculation()
    mutate(result)
    assert.equal(client.isCurrentBalancedScoreRow(result), false)
  }
})

test('immutable snapshots take precedence, retain database rounding, and reject mismatched provenance', () => {
  const result = calculation({ b: 60.123456 })
  for (const total of [60.123456, 60.12, 60]) {
    const row = persisted(result, total)
    row.scoreBreakdown = calculation({ b: 1 }).scoreBreakdown
    row.vibeAxes = {}
    assert.equal(client.isCurrentBalancedScoreRow(row), true)
    assert.equal(client.compatibilityTotalForDisplay(row), total)
    assert.equal(client.personalizedCompatibilityForDisplay(row).totalScore, 60.123456)
    row.score_content_hash = 'today-cache-content'
    assert.equal(client.isCurrentBalancedScoreRow(row), false)
  }
  const row = persisted(result)
  row.compatibility_score = 80
  assert.equal(client.isCurrentBalancedScoreRow(row), false)
})

test('historical scores remain historical and retain their saved numeric total', () => {
  const row = persisted(calculation(), 60)
  row.score_model_version = '2026-09-11-v13-events26-27-archetype-ai-chemistry-100'
  row.score_snapshot.scoreModelVersion = row.score_model_version
  row.score_snapshot.scoreBreakdown.personalized.scoreModelVersion = row.score_model_version
  assert.equal(client.isCurrentBalancedScoreRow(row), false)
  assert.equal(client.personalizedCompatibilityForDisplay(row), null)
  assert.equal(client.compatibilityTotalForDisplay(row), 60)
  row.score_provenance_valid = false
  assert.equal(client.compatibilityTotalForDisplay(row), 60)
})

test('the actual balanced runtime and persisted snapshot meet the client contract', async () => {
  const server = await import('./balanced-compatibility.mjs')
  assert.equal(server.BALANCED_COMPATIBILITY_VERSION, client.CURRENT_BALANCED_SCORE_MODEL)
  const a = { assigned_number: 1, answers: { mbti_1: 'A', conversational_role: 'A' } }
  const b = { assigned_number: 2, answers: { mbti_1: 'B', conversational_role: 'C' } }
  const result = server.calculateBalancedCompatibility(a, b)
  assert.equal(client.isCurrentBalancedScoreRow(result), true)
  const identity = server.buildBalancedCacheIdentity(a, b)
  const snapshot = server.buildBalancedScoreSnapshot(result, identity)
  const row = {
    score_model_version: server.BALANCED_COMPATIBILITY_VERSION,
    compatibility_score: result.totalScore,
    score_content_hash: identity.combinedContentHash,
    score_snapshot: snapshot,
  }
  assert.equal(client.isCurrentBalancedScoreRow(row), true)
  assert.equal(client.compatibilityTotalForDisplay(row), result.totalScore)
})

test('final reveal speech distinguishes a current ranking index from saved historical scores', async () => {
  const route = await readFile(new URL('../../app/routes/event3.tsx', import.meta.url), 'utf8')
  const helper = route.slice(route.indexOf('function normalizedFinalRevealScore'), route.indexOf('const FINAL_REVEAL_CARD_STYLES'))
  const compiled = ts.transpileModule(`${helper}\nglobalThis.describe = finalRevealSpokenScore`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const context = {
    event3FinalMeetingOccurred: result => result.met !== false,
    event3OperationalMeetingLabel: () => 'لم يبدأ اللقاء',
  }
  runInNewContext(compiled, context)
  assert.match(context.describe(67, { score_meaning: 'relative-ranking-not-probability' }), /مؤشر الترشيح 67 من 100/)
  assert.match(context.describe(67, {}), /النتيجة المحفوظة 67 من 100/)
  assert.equal(context.describe(67, { met: false }), 'لم يبدأ اللقاء')
  for (const slot of ['p2', 'p3', 'p4']) assert.ok(route.includes(`scoreMeaning={${slot}?.score_meaning}`))
})
