// Offline runtime parity and current-content AI replay for the User 7 benchmark.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import {
  buildBalancedCacheIdentity,
  calculateAiChemistryAdjustment,
  decodeBalancedVibeModelUsed,
  isBalancedVibeModelUsed,
} from '../server/matching/balanced-compatibility.mjs'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'tmp/training-2026-09-17')
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const report = read('tmp/training-2026-09-17/report.json')
const profiles = read('.tmp-user7-20260917-personalization.json')
const vibes = read('.tmp-user7-vibe-20260917-personalization.json')
const cache = read('.tmp-user7-ai-20260917-personalization.json')
const byNumber = new Map(profiles.map(p => [p.assigned_number, {
  ...p,
  survey_data: { answers: { ...p.answers, ...vibes.find(v => v.assigned_number === p.assigned_number)?.survey_data?.answers },
    vibeDescription: vibes.find(v => v.assigned_number === p.assigned_number)?.survey_data?.vibeDescription },
}]))
const runtimeSource = fs.readFileSync(path.join(root, 'server/matching/personalized-compatibility.mjs'), 'utf8')
const paths = {
  frozenV12: 'frozen-v12-config.json', candidateFull: 'candidate-config.json',
  v12User7Purged: 'v12User7Purged-config.json', candidateUser7Purged: 'candidateUser7Purged-config.json',
}
const runtimes = {}
for (const [name, config] of Object.entries(paths)) {
  const filename = path.join(out, `${name}-runtime.mjs`)
  fs.writeFileSync(filename, runtimeSource.replace("'./personalized-model-config.json'", `'./${config}'`))
  runtimes[name] = await import(pathToFileURL(filename).href)
}
let maxDelta = 0
const divergences = []
const rows = report.user7.people.map(person => {
  const other = byNumber.get(person.participantNumber)
  const identity = buildBalancedCacheIdentity(byNumber.get(7), other)
  const valid = cache.find(c => [c.participant_a_number, c.participant_b_number].includes(person.participantNumber)
    && c.vibe_content_hash === identity.vibeContentHash
    && isBalancedVibeModelUsed(c.model_used)
    && !String(c.model_used).includes('fallback=')
    && calculateAiChemistryAdjustment(c.vibe_axes || decodeBalancedVibeModelUsed(c.model_used)).ready)
  const ai = valid ? calculateAiChemistryAdjustment(valid.vibe_axes || decodeBalancedVibeModelUsed(valid.model_used)) : null
  const scores = {}
  for (const [name, runtime] of Object.entries(runtimes)) {
    const score = runtime.calculatePersonalizedCompatibility(byNumber.get(7), other)
    const expected = person[name]
    maxDelta = Math.max(maxDelta, Math.abs(expected.directional - score.aToB.score), Math.abs(expected.mutual - score.totalScore))
    if (Math.abs(expected.directional - score.aToB.score) > 0.00001 || Math.abs(expected.mutual - score.totalScore) > 0.00001) {
      divergences.push({ model: name, participantNumber: person.participantNumber, expected, actual: { directional: score.aToB.score, mutual: score.totalScore }, rawUtility: score.aToB.rawUtility })
    }
    scores[name] = { directional: score.aToB.score, base: score.totalScore,
      final: ai ? Math.max(0, Math.min(100, score.totalScore + ai.adjustment)) : null }
  }
  return { participantNumber: person.participantNumber, label: person.label,
    ai: ai ? { score: ai.score, adjustment: ai.adjustment, createdAt: valid.created_at, exactCurrentContentHash: true } : null, scores }
})
console.log(JSON.stringify({ maxDelta, divergences }, null, 2))
assert.ok(maxDelta <= 0.00001, `Python/runtime divergence ${maxDelta}`)

function auc(positive, negative) {
  if (!positive.length || !negative.length) return null
  let wins = 0
  for (const a of positive) for (const b of negative) wins += a > b ? 1 : a === b ? 0.5 : 0
  return wins / (positive.length * negative.length)
}
const tasks = {
  likedVsDisliked: [['romantic', 'friendly'], ['disliked']],
  romanticVsDisliked: [['romantic'], ['disliked']],
  friendlyVsDisliked: [['friendly'], ['disliked']],
  romanticVsFriendly: [['romantic'], ['friendly']],
}
const aiRows = rows.filter(r => r.ai)
const models = {}
for (const name of Object.keys(runtimes)) {
  models[name] = {}
  for (const [task, [pos, neg]] of Object.entries(tasks)) {
    const positives = aiRows.filter(r => pos.includes(r.label))
    const negatives = aiRows.filter(r => neg.includes(r.label))
    models[name][task] = { positive: positives.length, negative: negatives.length,
      baseAucSameCoverage: auc(positives.map(r => r.scores[name].base), negatives.map(r => r.scores[name].base)),
      finalAuc: auc(positives.map(r => r.scores[name].final), negatives.map(r => r.scores[name].final)) }
  }
}
const result = { runtimeParity: { passed: true, comparisons: rows.length * Object.keys(runtimes).length * 2, maxScoreDelta: maxDelta },
  aiReplay: { coverage: aiRows.length, total: rows.length, missing: rows.filter(r => !r.ai).map(r => r.participantNumber),
    policy: 'Same verified-current cached semantic evidence and unchanged V12 correction for every model; missing AI is unscored, not assumed neutral.' },
  models, rows }
fs.writeFileSync(path.join(out, 'user7-runtime-ai-report.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({ runtimeParity: result.runtimeParity, aiReplay: result.aiReplay, models }, null, 2))
