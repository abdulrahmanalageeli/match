import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

process.env.SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key'
process.env.OPENAI_API_KEY ||= 'test-openai-key'
process.env.MATCH_LOG_LEVEL = 'debug'

const {
  buildPossibleMatchGateReport,
  isGenuinelyCompletedParticipant,
  normalizePossibleMatchesScope,
} = await import('../../api/admin/trigger-match.mjs')

function completeParticipant(number, overrides = {}) {
  const participant = {
    assigned_number: number,
    name: `Participant ${number}`,
    age: 30,
    gender: number % 2 ? 'male' : 'female',
    nationality: 'Saudi',
    preferred_age_min: 20,
    preferred_age_max: 40,
    signup_for_next_event: true,
    event_id: 21,
    attachment_style: 'Secure',
    communication_style: 'Direct',
    humor_banter_style: 'B',
    early_openness_comfort: 2,
    survey_data: {
      name: `Participant ${number}`,
      answers: {
        lifestyle_1: 'A', lifestyle_2: 'A', lifestyle_3: 'A', lifestyle_4: 'A', lifestyle_5: 'A',
        core_values_1: 'A', core_values_2: 'A', core_values_3: 'A', core_values_4: 'A', core_values_5: 'A',
        conversational_role: 'A', conversation_depth_pref: 'A', social_battery: 'A',
        humor_subtype: 'A', curiosity_style: 'A', silence_comfort: 'A', intent_goal: 'A',
      },
    },
  }
  return { ...participant, ...overrides }
}

test('possible-match scope normalizes to current event or all submitted history', () => {
  assert.equal(normalizePossibleMatchesScope(undefined), 'event')
  assert.equal(normalizePossibleMatchesScope('event'), 'event')
  assert.equal(normalizePossibleMatchesScope('all'), 'all')
  assert.equal(normalizePossibleMatchesScope('non-event'), 'all')
})

test('possible-match membership requires both submission marker and strict score completeness', () => {
  const complete = completeParticipant(1)
  assert.equal(isGenuinelyCompletedParticipant(complete), true)
  assert.equal(isGenuinelyCompletedParticipant({ ...complete, name: null, survey_data: { ...complete.survey_data, name: null } }), false)
  assert.equal(isGenuinelyCompletedParticipant({
    ...complete,
    survey_data: {
      ...complete.survey_data,
      answers: { ...complete.survey_data.answers, silence_comfort: null },
    },
  }), false)
})

test('possible-match report names failed gates but marks them ignored for comparison', () => {
  const a = completeParticipant(1, {
    gender: 'male',
    same_gender_preference: true,
    prefer_same_nationality: true,
    preferred_age_min: 29,
    preferred_age_max: 31,
    early_openness_comfort: 0,
  })
  const b = completeParticipant(2, {
    gender: 'female',
    nationality: 'Kuwaiti',
    age: 45,
    signup_for_next_event: false,
    event_id: 20,
    preferred_age_min: 40,
    preferred_age_max: 50,
    early_openness_comfort: 3,
  })
  const report = buildPossibleMatchGateReport({
    participantA: a,
    participantB: b,
    eventId: 21,
    scope: 'all',
    attendanceAllowedB: false,
    historyConfidence: {
      history_confidence_enabled: true,
      never_pair_recommended: true,
      history_review_reason: 'Direct negative feedback',
    },
    excludedParticipantNumbers: [2],
    pairExcluded: true,
    lockedPartnerA: 9,
    previousMatchEvents: [20],
    currentRoundPartnersB: [8],
    forcedGenderMode: 'preference',
  })

  const failedKeys = new Set(report.failed_hard_gates.map(gate => gate.key))
  for (const key of ['admin_participant_exclusion', 'gender', 'nationality', 'age', 'interaction', 'excluded_pair', 'previous_match', 'locked_match', 'current_round', 'historical_never_pair']) {
    assert.ok(failedKeys.has(key), `expected failed gate ${key}`)
  }
  assert.equal(report.gates.find(gate => gate.key === 'current_event').applicable, false)
  assert.equal(report.gates.find(gate => gate.key === 'attendance').applicable, false)
  assert.equal(report.all_hard_gates_ignored, true)
  assert.equal(report.included_despite_gates, true)
  assert.ok(report.gates.filter(gate => failedKeys.has(gate.key)).every(gate => gate.ignored_for_possible_matches))
})

test('possible-match API batches exact cache reads and writes with a separate 16-call AI lane', async () => {
  const source = await readFile(new URL('../../api/admin/trigger-match.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('if (viewAllMatches) {')
  const end = source.indexOf('// Handle manual match creation', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const block = source.slice(start, end)

  assert.match(block, /isGenuinelyCompletedParticipant\(participant\)/)
  assert.match(block, /fetchCachedRowsForPairs\(cacheCandidatePairs, '\*'\)/)
  assert.match(block, /Promise\.allSettled\(localJobs\.map\(calculateJob\)\)/)
  assert.match(block, /const POSSIBLE_MATCH_AI_CONCURRENCY = 16/)
  assert.match(block, /aiJobs\.slice\(start, start \+ POSSIBLE_MATCH_AI_CONCURRENCY\)/)
  assert.match(block, /storeCachedCompatibilities\(cacheRowsToStore\)/)
  assert.doesNotMatch(block, /hardGateCompatibleMatches|genderCompatibleMatches/)
})
