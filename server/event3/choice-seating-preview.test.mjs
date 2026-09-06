import assert from "node:assert/strict"
import test from "node:test"

import { buildChoiceOnlySeatingCandidates } from "./choice-only-seating.mjs"
import {
  buildChoiceSeatingReport,
  choiceSeatingPreviewInternals,
  handleChoiceSeatingPreview,
  readChoiceSeatingPreview,
  signChoiceSeatingPreview,
} from "./choice-seating-preview.mjs"

const EVENT_ID = 26
const numbers = Array.from({ length: 42 }, (_, index) => index + 1)

test("fresh generation uses a distinct deterministic cache context and participant order", () => {
  const context = { contextHash: "a".repeat(64), participantNumbers: numbers }
  const regular = choiceSeatingPreviewInternals.freshGenerationContext({}, context)
  const fresh = choiceSeatingPreviewInternals.freshGenerationContext({
    bypass_cache: true,
    generation_nonce: "fresh-generation-0001",
  }, context)
  const repeated = choiceSeatingPreviewInternals.freshGenerationContext({
    bypass_cache: true,
    generation_nonce: "fresh-generation-0001",
  }, context)

  assert.equal(regular.cacheContextHash, context.contextHash)
  assert.equal(regular.variantId, null)
  assert.notEqual(fresh.cacheContextHash, context.contextHash)
  assert.deepEqual(repeated, fresh)
  assert.notDeepEqual(fresh.participantNumbers, numbers)
  assert.deepEqual([...fresh.participantNumbers].sort((left, right) => left - right), numbers)
  assert.throws(() => choiceSeatingPreviewInternals.freshGenerationContext({
    bypass_cache: true,
    generation_nonce: "bad",
  }, context), /valid generation nonce/)
})

function assignmentFixture() {
  return [1, 2, 3].flatMap(round => numbers.map((participant_id, index) => ({
    round,
    table_number: Math.floor(index / 6) + 1,
    participant_id,
  })))
}

function profile(number) {
  const style = ["A", "B", "C", "B"][number % 4]
  const role = ["A", "B", "C"][number % 3]
  const curiosity = ["A", "B", "C"][(number + 1) % 3]
  return {
    assigned_number: number,
    name: `P${number}`,
    gender: number <= 21 ? "female" : "male",
    age: 21 + (number % 18),
    phone_number: `private-${number}`,
    secure_token: `secret-${number}`,
    survey_data_updated_at: "2026-09-02T00:00:00.000Z",
    survey_data: { answers: {
      humor_banter_style: style,
      early_openness_comfort: String(number % 4),
      conversational_role: role,
      conversation_depth_pref: number % 2 ? "A" : "B",
      curiosity_style: curiosity,
      social_battery: number % 2 ? "A" : "B",
      silence_comfort: number % 3 ? "A" : "B",
      match_current_focus: [`focus-${number % 5}`],
      intent_goal: ["A", "B", "C"][number % 3],
      match_disagreement_style: style,
      communication_1: style,
      communication_2: style,
      communication_3: style,
      communication_4: style,
      communication_5: style,
      lifestyle_1: ["A", "B", "C"][number % 3],
      lifestyle_2: ["A", "B", "C"][number % 3],
      lifestyle_3: ["A", "B", "C"][number % 3],
      lifestyle_4: ["A", "B", "C"][number % 3],
      lifestyle_5: ["A", "B", "C"][number % 3],
      core_values_1: ["A", "B", "C"][number % 3],
      core_values_2: ["A", "B", "C"][number % 3],
      core_values_3: ["A", "B", "C"][number % 3],
      core_values_4: ["A", "B", "C"][number % 3],
      core_values_5: ["A", "B", "C"][number % 3],
    } },
  }
}

function fixture() {
  const profiles = numbers.map(profile)
  const tables = {
    event_state: {
      current_event_id: EVENT_ID,
      phase: "setup",
      global_timer_active: false,
      groups_locked: false,
      test_mode_active: false,
      test_mode_snapshot: null,
    },
    event3_participants: numbers.map((participant_number, position) => ({ participant_number, position })),
    session_assignments: [],
    locked_matches: [{ participant1_number: 1, participant2_number: 22 }],
    event3_exclusions: [{ participant_a_number: 2, participant_b_number: 23 }],
    participants: profiles,
    event3_choice_seating_reports: null,
  }
  const rpcCalls = []
  const fromCalls = []
  const db = {
    from(table) {
      fromCalls.push(table)
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: () => query,
        single: () => query,
        maybeSingle: () => query,
        then: resolve => resolve({ data: structuredClone(tables[table]), error: null }),
      }
      return query
    },
    async rpc(name, params) {
      rpcCalls.push({ name, params })
      return { data: { report_id: 91, success: true }, error: null }
    },
  }
  return { db, profiles, tables, rpcCalls, fromCalls }
}

test("choice preview tokens are signed, expiring, and reject edits", () => {
  const token = signChoiceSeatingPreview({ event_id: EVENT_ID }, "test-secret", 1000)
  assert.equal(readChoiceSeatingPreview(token, "test-secret", 1001).event_id, EVENT_ID)
  assert.throws(() => readChoiceSeatingPreview(token.replace(/^./, token[0] === "e" ? "f" : "e"), "test-secret", 1001))
  assert.throws(() => readChoiceSeatingPreview(token, "test-secret", 1000 + 15 * 60 * 1000))
})

test("report gender totals use the scheduler's F/M abbreviation normalization", () => {
  const groups = Array.from({ length: 7 }, (_, table) => numbers.slice(table * 6, table * 6 + 6))
  const report = buildChoiceSeatingReport({
    candidate: {
      id: "abbreviated-genders",
      rank: 1,
      canonicalObjective: {},
      diversity: null,
      plan: {
        round1: groups,
        round2: groups,
        round3: groups,
        repeatMetrics: {},
      },
    },
    genderMap: new Map(numbers.map(number => [number, number <= 21 ? "F" : "M"])),
    protectedPairs: [],
    participantNumbers: numbers,
  })
  assert.equal(report.gender_balance.tables.reduce((sum, table) => sum + table.unknown, 0), 0)
  assert.equal(report.gender_balance.tables.reduce((sum, table) => sum + table.female, 0), 63)
  assert.equal(report.gender_balance.tables.reduce((sum, table) => sum + table.male, 0), 63)
})

test("report gender balance uses roster-relative targets for a skewed known roster", () => {
  const females = numbers.slice(0, 29)
  const males = numbers.slice(29)
  let femaleOffset = 0
  let maleOffset = 0
  const groups = [5, 4, 4, 4, 4, 4, 4].map(femaleCount => {
    const group = [
      ...females.slice(femaleOffset, femaleOffset + femaleCount),
      ...males.slice(maleOffset, maleOffset + 6 - femaleCount),
    ]
    femaleOffset += femaleCount
    maleOffset += 6 - femaleCount
    return group
  })
  const report = buildChoiceSeatingReport({
    candidate: {
      id: "skewed-genders",
      rank: 1,
      canonicalObjective: {},
      diversity: null,
      plan: { round1: groups, round2: groups, round3: groups, repeatMetrics: {} },
    },
    genderMap: new Map(numbers.map(number => [number, number <= 29 ? "F" : "M"])),
    protectedPairs: [],
    participantNumbers: numbers,
  })
  assert.deepEqual(report.gender_balance.roster_targets, {
    female: { total: 29, minimum_per_table: 4, maximum_per_table: 5 },
    male: { total: 13, minimum_per_table: 1, maximum_per_table: 2 },
    unknown: { total: 0, minimum_per_table: 0, maximum_per_table: 0 },
  })
  assert.equal(report.gender_balance.all_tables_balanced, true)
  assert.equal(report.gender_balance.tables.every(table => table.within_roster_targets && table.complete), true)
})

test("previews three ranked read-only candidates and atomically applies only the signed selection", async () => {
  const { db, profiles, rpcCalls } = fixture()
  const request = {
    db,
    action: "e3-preview-choice-seating",
    body: { expected_event_id: EVENT_ID, expected_test_mode: false },
    eventId: EVENT_ID,
    secret: "test-secret",
    buildCandidates: buildChoiceOnlySeatingCandidates,
  }
  const preview = await handleChoiceSeatingPreview(request)
  assert.equal(preview.candidates.length, 3)
  assert.deepEqual(preview.candidates.map(candidate => candidate.rank), [1, 2, 3])
  assert.equal(new Set(preview.candidates.map(candidate => candidate.candidate_id)).size, 3)
  assert.equal(rpcCalls.length, 0)
  assert.equal(JSON.stringify(preview).includes("private-"), false)
  for (const candidate of preview.candidates) {
    assert.equal(candidate.report.schema_version, "event3-choice-seating-report-v1")
    assert.equal(candidate.report.rounds.length, 3)
    assert.deepEqual(candidate.report.rounds.map(round => round.tables.length), [7, 7, 7])
    assert.deepEqual([
      candidate.report.repeats.round1_round2,
      candidate.report.repeats.round1_round3,
      candidate.report.repeats.round2_round3,
    ], [0, 0, 0])
    assert.equal(candidate.report.repeats.unique_partners.minimum, 15)
    assert.equal(candidate.report.repeats.unique_partners.maximum, 15)
    assert.equal(candidate.report.repeats.repeated_in_all_three, 0)
    assert.equal(candidate.report.missing_survey_fields.length, 0)
    assert.deepEqual(candidate.report.decision_context.selected, {
      candidate_id: candidate.candidate_id,
      rank: candidate.rank,
    })
    assert.equal(candidate.report.decision_context.alternatives_summary.length, 3)
    assert.deepEqual(candidate.report.decision_context.alternatives_summary.map(option => option.rank), [1, 2, 3])
    assert.equal(JSON.stringify(candidate.report.decision_context).includes("participant_numbers"), false)
  }

  const selected = preview.candidates[1]
  const applyRequest = {
    ...request,
    action: "e3-apply-choice-seating-preview",
    body: { ...request.body, token: selected.token },
  }
  profiles[0].age++
  await assert.rejects(handleChoiceSeatingPreview(applyRequest), /changed since this preview/)
  profiles[0].age--
  const applied = await handleChoiceSeatingPreview(applyRequest)
  assert.equal(applied.success, true)
  assert.equal(applied.report_id, 91)
  assert.equal(applied.candidate_rank, 2)
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, "apply_event3_choice_seating_preview")
  assert.equal(rpcCalls[0].params.p_static_match_id, "00000000-0000-0000-0000-000000000000")
  assert.deepEqual(rpcCalls[0].params.p_expected_roster, numbers.map((participant_number, position) => ({ participant_number, position })))
  assert.equal(rpcCalls[0].params.p_profile_versions.length, 42)
  assert.deepEqual(rpcCalls[0].params.p_expected_protected_pairs, [
    { participant_a: 1, participant_b: 22 },
    { participant_a: 2, participant_b: 23 },
  ])
  assert.deepEqual(rpcCalls[0].params.p_expected_assignments, [])
  assert.equal(rpcCalls[0].params.p_expected_report_id, null)
  assert.equal(rpcCalls[0].params.p_assignments.length, 126)
  assert.equal(rpcCalls[0].params.p_report.candidate.id, selected.candidate_id)
  assert.equal(rpcCalls[0].params.p_candidate_rank, 2)
  assert.equal(rpcCalls[0].params.p_report.decision_context.alternatives_summary.length, 3)
})

test("legacy test sessions sign their display key but pass a nullable raw start time to the RPC", async () => {
  const { db, tables, rpcCalls } = fixture()
  tables.event_state.test_mode_active = true
  tables.event_state.test_mode_snapshot = {}
  const base = {
    db,
    body: { expected_event_id: EVENT_ID, expected_test_mode: true },
    eventId: EVENT_ID,
    secret: "test-secret",
    buildCandidates: buildChoiceOnlySeatingCandidates,
  }
  const preview = await handleChoiceSeatingPreview({ ...base, action: "e3-preview-choice-seating" })
  const signed = readChoiceSeatingPreview(preview.candidates[0].token, "test-secret")
  assert.equal(signed.session_key, "legacy-test")
  assert.equal(signed.expected_started_at, null)
  const applied = await handleChoiceSeatingPreview({
    ...base,
    action: "e3-apply-choice-seating-preview",
    body: { ...base.body, token: preview.candidates[0].token },
  })
  assert.equal(applied.success, true)
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].params.p_expected_test_mode, true)
  assert.equal(rpcCalls[0].params.p_expected_started_at, null)
})

test("missing lens answers remain visible but use neutral evidence instead of blocking seating", async () => {
  const { db, profiles, rpcCalls } = fixture()
  delete profiles[0].survey_data.answers.silence_comfort
  let schedulerCalled = false
  const preview = await handleChoiceSeatingPreview({
    db,
    action: "e3-preview-choice-seating",
    body: { expected_event_id: EVENT_ID, expected_test_mode: false },
    eventId: EVENT_ID,
    secret: "test-secret",
    buildCandidates(participants, options) {
      schedulerCalled = true
      assert.equal(options.requireCompleteLensProfiles, false)
      assert.equal(options.profileMap.has(1), false)
      return buildChoiceOnlySeatingCandidates(participants, options)
    },
  })
  assert.equal(schedulerCalled, true)
  assert.deepEqual(preview.missing_survey_fields, [{ participant_number: 1, fields: ["silence_comfort"] }])
  assert.deepEqual(preview.candidates[0].report.missing_survey_fields, preview.missing_survey_fields)
  assert.equal(preview.candidates[0].report.summary.missing_survey_field_count, 1)
  assert.equal(rpcCalls.length, 0)
})

test("retrieves the latest persisted report only for the active live/test context", async () => {
  const { db, tables } = fixture()
  const assignments = assignmentFixture()
  tables.session_assignments = structuredClone(assignments)
  tables.event3_choice_seating_reports = {
    id: 91,
    candidate_id: "candidate-2",
    candidate_rank: 2,
    generator_version: "spark-depth-rhythm-v1",
    context_hash: "a".repeat(64),
    report: { schema_version: "event3-choice-seating-report-v1" },
    assignments: structuredClone(assignments),
    created_at: "2026-09-02T00:00:00.000Z",
  }
  const result = await handleChoiceSeatingPreview({
    db,
    action: "e3-get-choice-seating-report",
    body: { expected_event_id: EVENT_ID, expected_test_mode: false },
    eventId: EVENT_ID,
    secret: "test-secret",
  })
  assert.equal(result.report.id, 91)
  assert.equal(result.report.candidate_rank, 2)
  assert.equal(result.matches_current_seating, true)
  assert.equal(result.report.matches_current_seating, true)
  assert.equal(result.current_assignment_count, 126)

  tables.session_assignments[0].table_number = 6
  const stale = await handleChoiceSeatingPreview({
    db,
    action: "e3-get-choice-seating-report",
    body: { expected_event_id: EVENT_ID, expected_test_mode: false },
    eventId: EVENT_ID,
    secret: "test-secret",
  })
  assert.equal(stale.matches_current_seating, false)
  assert.equal(stale.report.matches_current_seating, false)
})

test("historical report reads are live-only and do not depend on current event state", async () => {
  const { db, tables, fromCalls } = fixture()
  const assignments = assignmentFixture()
  tables.session_assignments = structuredClone(assignments)
  tables.event3_choice_seating_reports = {
    id: 72,
    candidate_id: "historical-best",
    candidate_rank: 1,
    generator_version: "spark-depth-rhythm-v1",
    context_hash: "b".repeat(64),
    report: { schema_version: "event3-choice-seating-report-v1" },
    assignments: structuredClone(assignments),
    created_at: "2026-08-01T00:00:00.000Z",
  }
  const historical = await handleChoiceSeatingPreview({
    db,
    action: "e3-get-choice-seating-report",
    body: { preview_event_id: 25, expected_event_id: 25, expected_test_mode: false },
    eventId: 25,
    secret: "test-secret",
  })
  assert.equal(historical.report.id, 72)
  assert.equal(historical.matches_current_seating, true)
  assert.deepEqual(fromCalls, ["event3_choice_seating_reports", "session_assignments"])
  await assert.rejects(handleChoiceSeatingPreview({
    db,
    action: "e3-get-choice-seating-report",
    body: { preview_event_id: 25, expected_event_id: 25, expected_test_mode: true },
    eventId: 25,
    secret: "test-secret",
  }), /only expose the saved live-event decision/)
  await assert.rejects(handleChoiceSeatingPreview({
    db,
    action: "e3-preview-choice-seating",
    body: { preview_event_id: 25, expected_event_id: 25, expected_test_mode: false },
    eventId: 25,
    secret: "test-secret",
    buildCandidates: buildChoiceOnlySeatingCandidates,
  }), /active event/)
})
