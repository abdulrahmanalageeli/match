import assert from 'node:assert/strict'
import test from 'node:test'
import { buildChoiceOnlySeatingCandidates, buildChoiceOnlySeatingCandidatesStep, choiceOnlySeatingMetrics } from './choice-only-seating.mjs'

const participants = Array.from({ length: 46 }, (_, index) => index + 1)
const genderMap = Object.fromEntries(participants.map(n => [n, n <= 23 ? 'female' : 'male']))
const ageMap = Object.fromEntries(participants.map(n => [n, 20 + n % 24]))
const lockedPairsSet = new Set(['1-24', '2-25', '3-26', '4-27', '5-28', '6-29'])

function assertPlan(plan, balanced) {
  assert.equal(plan.R, 0)
  const metrics = choiceOnlySeatingMetrics(plan.round1, plan.round2, plan.round3)
  assert.equal(metrics.totalRepeatedPairOccurrences, 0)
  assert.equal(metrics.maximumParticipantRepeatBurden, 0)
  for (const round of [plan.round1, plan.round2, plan.round3]) {
    assert.deepEqual(round.map(group => group.length), [7, 7, 7, 7, 6, 6, 6])
    assert.deepEqual(round.flat().sort((a,b) => a-b), participants)
    for (const group of round) {
      if (balanced) {
        const women = group.filter(n => genderMap[n] === 'female').length
        assert.deepEqual([women, group.length-women].sort(), group.length === 6 ? [3, 3] : [3, 4])
      }
      for (const key of lockedPairsSet) {
        const [a,b] = key.split('-').map(Number)
        assert.ok(!group.includes(a) || !group.includes(b))
      }
    }
  }
  assert.ok(plan.round2Age)
  assert.ok(plan.round3Age)
}

test('46-person alternatives preserve capacities, gender balance, age objectives, and zero repeats', () => {
  const result = buildChoiceOnlySeatingCandidates(participants, { genderMap, ageMap, lockedPairsSet })
  assert.equal(result.error, undefined)
  assert.equal(result.candidates.length, 3)
  for (const candidate of result.candidates) assertPlan(candidate.plan, true)
})

test('46-person no-repeat guarantee also holds without gender data and in resumed searches', () => {
  const result = buildChoiceOnlySeatingCandidates([...participants].reverse(), { ageMap, lockedPairsSet })
  assert.equal(result.error, undefined)
  for (const candidate of result.candidates) assertPlan(candidate.plan, false)
  let checkpoint = null
  for (let step = 0; step < 4; step++) {
    const response = buildChoiceOnlySeatingCandidatesStep(participants, { genderMap, ageMap, lockedPairsSet }, checkpoint)
    if (response.complete) {
      assert.equal(response.generated.error, undefined)
      response.generated.candidates.forEach(candidate => assertPlan(candidate.plan, true))
    } else {
      checkpoint = response.checkpoint
      assertPlan(checkpoint.candidates.at(-1).plan, true)
    }
  }
})

test('46-person impossible exclusions fail instead of returning repeated or forbidden pairs', () => {
  const result = buildChoiceOnlySeatingCandidatesStep(participants, {
    genderMap, lockedPairsSet: new Set(participants.slice(1).map(n => `1-${n}`)),
  })
  assert.equal(result.complete, true)
  assert.match(result.generated.error, /protected pairs/)
})
