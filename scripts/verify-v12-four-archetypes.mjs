import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'tmp/archetypes-2-vs-4-2026-09-17')
const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'))
const profiles = new Map(JSON.parse(fs.readFileSync(path.join(root, '.tmp-user7-20260917-personalization.json'), 'utf8')).map(p => [p.assigned_number, p]))
const source = fs.readFileSync(path.join(root, 'server/matching/personalized-compatibility.mjs'), 'utf8')
const paths = {
  k2: '../training-2026-09-17/candidate-config.json',
  k4: './candidate-k4-config.json',
  k2User7Purged: '../training-2026-09-17/candidateUser7Purged-config.json',
  k4User7Purged: './candidate-k4-user7-purged-config.json',
  frozenV12: '../training-2026-09-17/frozen-v12-config.json',
}
let comparisons = 0
let maxDelta = 0
for (const [name, config] of Object.entries(paths)) {
  const filename = path.join(out, `${name}-runtime.mjs`)
  fs.writeFileSync(filename, source.replace("'./personalized-model-config.json'", `'${config}'`))
  const runtime = await import(pathToFileURL(filename).href)
  for (const p of report.user7.rows) {
    const result = runtime.calculatePersonalizedCompatibility(profiles.get(7), profiles.get(p.participantNumber))
    const expected = p.scores[name]
    for (const [actual, target] of [[result.aToB.score, expected.directional], [result.totalScore, expected.base]]) {
      maxDelta = Math.max(maxDelta, Math.abs(actual - target))
      assert.ok(Math.abs(actual - target) <= 1e-6, `${name} / ${p.participantNumber}: ${actual} != ${target}`)
      comparisons++
    }
    assert.equal(Math.max(0, Math.min(100, result.totalScore + p.ai.adjustment)), expected.final)
    comparisons++
  }
}
const result = { passed: true, comparisons, maxScoreDelta: maxDelta, scope: 'Python vs existing JavaScript runtime; base, directional and identical fixed AI correction for 30 User 7 pairs across five models.' }
fs.writeFileSync(path.join(out, 'runtime-verification.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result))
