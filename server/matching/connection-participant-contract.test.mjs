import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import {
  BALANCED_COMPATIBILITY_VERSION,
  OPPOSITES_COMPATIBILITY_VERSION,
  BALANCED_VIBE_MAX,
  BALANCED_VIBE_MODEL,
  BALANCED_VIBE_VERSION,
  BALANCED_VIBE_MODEL_TAG,
  buildBalancedCacheIdentity,
  buildBalancedScoreSnapshot,
  calculateBalancedCompatibility,
  createNeutralVibeAxes,
  isCurrentBalancedScoreSnapshot,
  isCurrentOppositesScoreSnapshot,
} from './balanced-compatibility.mjs'

// Exercise the actual API helpers without importing the route's database client.
function loadFunctions(path, names, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const declarations = names.map(name => {
    const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name)
    assert.ok(node, `Missing actual API function ${name}`)
    return node.getText(ast)
  })
  return runInNewContext(`${declarations.join('\n')}\n({ ${names.join(', ')} })`, globals)
}

const { participantBreakdownFromScoreSnapshot: fromSnapshot, formatParticipantBreakdownReason: participantReason } =
  loadFunctions('../../api/participant.mjs', [
    'parseJsonObject', 'participantBreakdownFromScoreSnapshot', 'formatParticipantBreakdownReason',
  ], {
    BALANCED_COMPATIBILITY_VERSION, OPPOSITES_COMPATIBILITY_VERSION,
    BALANCED_VIBE_MAX, BALANCED_VIBE_MODEL, BALANCED_VIBE_VERSION, BALANCED_VIBE_MODEL_TAG,
    isCurrentBalancedScoreSnapshot, isCurrentOppositesScoreSnapshot,
  })
const { formatBalancedScoreReason: adminReason } =
  loadFunctions('../../api/admin/trigger-match.mjs', ['formatBalancedScoreReason'])

function fixture() {
  const a = { assigned_number: 7, answers: { mbti_1: 'A', conversational_role: 'A', social_battery: 'A' } }
  const b = { assigned_number: 16, answers: { mbti_1: 'B', conversational_role: 'C', social_battery: 'B' } }
  const result = calculateBalancedCompatibility(a, b, { vibeAxes: createNeutralVibeAxes() })
  const { combinedContentHash } = buildBalancedCacheIdentity(a, b)
  const snapshot = buildBalancedScoreSnapshot(result, { combinedContentHash })
  const persisted = { scoreModelVersion: snapshot.scoreModelVersion, scoreContentHash: combinedContentHash,
    storedTotal: snapshot.totalScore }
  return { result, snapshot, persisted }
}

test('participant API accepts real V14 snapshots and preserves persisted rounded totals', () => {
  const { result, snapshot, persisted } = fixture()
  for (const input of [snapshot, JSON.stringify(snapshot)]) {
    const value = fromSnapshot(input, persisted)
    assert.ok(value)
    assert.equal(value.total, snapshot.totalScore)
    assert.equal(value.scoreModelVersion, BALANCED_COMPATIBILITY_VERSION)
    assert.equal(value.personalized.scoreMeaning, 'relative-ranking-not-probability')
    assert.equal(value.personalized.totalScore, Math.min(value.personalized.aToB.score, value.personalized.bToA.score))
    assert.equal(value.aiChemistryAdjustment, 0)
    assert.equal(value.aiChemistryApplied, false)
    assert.equal(value.personalized.totalScore, result.totalScore)
  }
  for (const savedTotal of [Number(snapshot.totalScore.toFixed(2)), Math.round(snapshot.totalScore)]) {
    const saved = structuredClone(snapshot)
    saved.totalScore = savedTotal
    const value = fromSnapshot(saved, { ...persisted, storedTotal: savedTotal })
    assert.ok(value)
    assert.equal(value.total, savedTotal)
  }
})

test('participant API rejects altered learned arithmetic, AI application, and model provenance', () => {
  const { snapshot, persisted } = fixture()
  const changes = [
    ['mean instead of minimum', value => { value.scoreBreakdown.personalized.mutualFormula = 'mean' }],
    ['raw directional utility', value => { value.scoreBreakdown.personalized.aToB.rawUtility += .2 }],
    ['raw mutual utility', value => { value.scoreBreakdown.personalized.rawMutualUtility += .2 }],
    ['direction index', value => { value.scoreBreakdown.personalized.aToB.score += .2 }],
    ['learned total', value => { value.scoreBreakdown.personalized.totalScore += .2 }],
    ['AI marked applied', value => { value.scoreBreakdown.aiChemistryApplied = true }],
    ['AI added to score', value => { value.scoreBreakdown.aiChemistryAdjustment = 12 }],
    ['wrong source artifact', value => { value.scoreBreakdown.personalized.sourceArtifactSha256 = '0'.repeat(64) }],
    ['wrong scale provenance', value => { value.scoreBreakdown.personalized.calibration = 'other' }],
    ['wrong nested model', value => { value.scoreBreakdown.personalized.scoreModelVersion = 'other' }],
    ['wrong probability meaning', value => { value.scoreBreakdown.personalized.scoreMeaning = 'probability' }],
    ['wrong snapshot model', value => { value.scoreModelVersion = 'other' }],
    ['wrong snapshot content', value => { value.combinedContentHash = 'other' }],
    ['missing questions', value => { delete value.questionScores }],
    ['missing AI axes', value => { delete value.vibeAxes }],
  ]
  for (const [label, mutate] of changes) {
    const changed = structuredClone(snapshot)
    mutate(changed)
    assert.equal(fromSnapshot(changed, persisted), null, label)
  }
  for (const changed of [
    { ...persisted, scoreModelVersion: 'other' },
    { ...persisted, scoreContentHash: 'other' },
    { ...persisted, storedTotal: persisted.storedTotal + 1 },
    { ...persisted, storedTotal: null },
  ]) assert.equal(fromSnapshot(snapshot, changed), null)
  for (const malformed of [null, 'not JSON', '[]', []]) assert.equal(fromSnapshot(malformed, persisted), null)
})

test('historical snapshots retain original totals and reject missing totals even when score is zero', () => {
  const version = '2026-09-11-v13-events26-27-archetype-ai-chemistry-100'
  for (const total of [67.25, 0]) {
    const snapshot = { scoreModelVersion: version, combinedContentHash: 'historical-hash', totalScore: total,
      scoreMaximum: 100, scoreBreakdown: { historicalOnlyComponent: 9 } }
    const persisted = { scoreModelVersion: version, scoreContentHash: 'historical-hash', storedTotal: total }
    const value = fromSnapshot(snapshot, persisted)
    assert.ok(value)
    assert.equal(value.total, total)
    assert.equal(value.legacy, true)
    assert.equal(value.scoreModelVersion, version)
    assert.equal(value.historicalOnlyComponent, 9)
    assert.equal(value.personalized, undefined)
    assert.equal(participantReason(value), `Historical score model: ${version}`)
    for (const missing of [null, undefined, '', NaN]) {
      assert.equal(fromSnapshot(snapshot, { ...persisted, storedTotal: missing }), null)
    }
  }
})

test('participant and admin reasons label relative ranking and diagnostic-only AI consistently', () => {
  const { result, snapshot, persisted } = fixture()
  const breakdown = fromSnapshot(snapshot, persisted)
  const participantText = participantReason(breakdown)
  const adminText = adminReason(result)
  assert.match(participantText, /^Shared connection index:/)
  assert.match(participantText, /mutual: minimum/)
  assert.match(adminText, /Mutual minimum:/)
  for (const reason of [participantText, adminText]) {
    assert.match(reason, /relative ranking, not probability/)
    assert.match(reason, /A→B: .*\/100/)
    assert.match(reason, /B→A: .*\/100/)
    assert.match(reason, /AI chemistry: .*\(diagnostic only\)/)
    assert.doesNotMatch(reason, /archetype|success probability|chance of success/i)
  }
  assert.equal(participantReason(null), '')
})
