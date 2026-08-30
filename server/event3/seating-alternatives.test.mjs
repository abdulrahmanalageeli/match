import assert from "node:assert/strict"
import test from "node:test"
import { buildSeatingAlternatives, canonicalSeating, handleSeatingAlternatives, readSeatingPreview, seatingMetrics, signSeatingPreview } from "./seating-alternatives.mjs"
import { buildSixBySevenPlan } from "./round2-age-optimizer.mjs"

function fixture() {
  const participants = Array.from({ length: 24 }, (_, i) => ({ number: i + 1, name: `P${i + 1}`, gender: i < 12 ? "female" : "male", age: 24 + i % 8 }))
  const assignments = []
  for (let round = 1; round <= 2; round++) for (let i = 0; i < participants.length; i++) {
    assignments.push({ round, participant_id: participants[i].number, table_number: round === 1 ? Math.floor(i / 6) + 1 : ((Math.floor(i / 6) + i % 6) % 4) + 1 })
  }
  return { participants, assignments }
}

function seeded(seed = 42) { return () => ((seed = seed * 1664525 + 1013904223 >>> 0) / 2 ** 32) }
const tableCounts = rows => Object.fromEntries([...new Set(rows.map(r => `${r.round}:${r.table_number}`))].map(key => [key, rows.filter(r => `${r.round}:${r.table_number}` === key).length]))
const tableGenders = (rows, participants) => Object.fromEntries([...new Set(rows.map(r => `${r.round}:${r.table_number}`))].map(key => [key, ["female", "male"].map(g => rows.filter(r => `${r.round}:${r.table_number}` === key && participants[r.participant_id - 1].gender === g).length)]))

test("creates three read-only alternatives for both rounds while preserving structural constraints", () => {
  const input = fixture()
  const before = structuredClone(input.assignments)
  const result = buildSeatingAlternatives({ ...input, random: seeded(), attempts: 4000 })
  assert.equal(result.alternatives.length, 3)
  assert.deepEqual(input.assignments, before)
  for (const alternative of result.alternatives) {
    assert.notDeepEqual(alternative.assignments, canonicalSeating(before))
    assert.deepEqual(tableCounts(alternative.assignments), tableCounts(before))
    assert.deepEqual(tableGenders(alternative.assignments, input.participants), tableGenders(before, input.participants))
    assert.equal(alternative.metrics.repeated_pairs, result.current.metrics.repeated_pairs)
    assert.ok(alternative.assignments.filter(row => row.round === 1).some(row => before.find(old => old.round === 1 && old.participant_id === row.participant_id).table_number !== row.table_number))
    assert.ok(alternative.assignments.filter(row => row.round === 2).some(row => before.find(old => old.round === 2 && old.participant_id === row.participant_id).table_number !== row.table_number))
  }
  assert.equal(new Set(result.alternatives.map(plan => JSON.stringify(plan.assignments))).size, 3)
})

test("does not create a new encounter for a protected pair", () => {
  const input = fixture()
  const baseline = seatingMetrics(input.assignments, input.participants)
  const result = buildSeatingAlternatives({ ...input, protectedPairs: [[1, 18]], random: seeded(7), attempts: 5000 })
  for (const plan of result.alternatives) {
    const rounds = [1, 2].filter(round => {
      const rows = plan.assignments.filter(row => row.round === round)
      return rows.find(row => row.participant_id === 1).table_number === rows.find(row => row.participant_id === 18).table_number
    }).length
    const oldRounds = [1, 2].filter(round => {
      const rows = input.assignments.filter(row => row.round === round)
      return rows.find(row => row.participant_id === 1).table_number === rows.find(row => row.participant_id === 18).table_number
    }).length
    assert.ok(rounds <= oldRounds)
    assert.equal(plan.metrics.repeated_pairs, baseline.repeated_pairs)
  }
})

test("preview tokens are signed, expiring, and reject edits", () => {
  const token = signSeatingPreview({ event_id: 26, baseline: [], assignments: [] }, "secret", 1000)
  assert.equal(readSeatingPreview(token, "secret", 1001).event_id, 26)
  assert.throws(() => readSeatingPreview(token.replace(/^./, token[0] === "e" ? "f" : "e"), "secret", 1001))
  assert.throws(() => readSeatingPreview(token, "secret", 1000 + 15 * 60 * 1000))
})

test("request preview cannot write and application is bound to the signed event and profile context", async () => {
  const input = fixture()
  const state = { current_event_id: 26, phase: "setup", test_mode_active: false, global_timer_active: false, groups_locked: false }
  const profiles = input.participants.map(p => ({ assigned_number: p.number, name: p.name, gender: p.gender, age: p.age, survey_data: {}, phone_number: "private-phone", secure_token: "private-token" }))
  const tables = { event_state: state, event3_participants: profiles.map(p => ({ participant_number: p.assigned_number })), session_assignments: input.assignments, locked_matches: [], event3_exclusions: [], participants: profiles }
  const mutations = []
  const db = {
    from(table) {
      const query = { select: () => query, eq: () => query, in: () => query, order: () => query, single: () => query, then: resolve => resolve({ data: structuredClone(tables[table]), error: null }) }
      return query
    },
    async rpc(name, params) { mutations.push({ name, params }); return { data: { success: true } } },
  }
  const request = { db, action: "e3-get-seating-alternatives", body: { expected_event_id: 26, expected_test_mode: false }, eventId: 26, secret: "test-secret", loadScores: async () => new Map() }
  const result = await handleSeatingAlternatives(request)
  assert.ok(result.alternatives.length > 0)
  assert.equal(mutations.length, 0)
  assert.equal(JSON.stringify(result).includes("private-phone"), false)
  assert.deepEqual(Object.keys(result.participants[0]).sort(), ["age", "gender", "name", "number"])
  const token = result.alternatives[0].token
  const apply = overrides => handleSeatingAlternatives({ ...request, action: "e3-apply-seating-alternative", body: { ...request.body, token }, ...overrides })
  await assert.rejects(apply({ eventId: 27, body: { expected_event_id: 27, expected_test_mode: false, token } }), /تغيّرت الفعالية/)
  await assert.rejects(apply({ body: { ...request.body, token, preview_event_id: 25 } }), /الحالية فقط/)
  profiles[0].age++
  await assert.rejects(apply(), /تغيّرت بيانات الفعالية/)
  profiles[0].age--
  assert.equal(mutations.length, 0)
  assert.equal((await apply()).success, true)
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].name, "apply_event3_seating_alternative")
  assert.deepEqual(mutations[0].params.p_expected, canonicalSeating(input.assignments))
  assert.deepEqual(mutations[0].params.p_proposed, result.alternatives[0].assignments)
})

test("missing roster seats are rejected, and unknown scores are not presented as zero", () => {
  const input = fixture()
  assert.throws(() => buildSeatingAlternatives({ ...input, assignments: input.assignments.slice(1) }), /ولّد جلستي/)
  const metrics = seatingMetrics(input.assignments, input.participants)
  assert.equal(metrics.compatibility, null)
  assert.equal(metrics.scored_pairs, 0)
  assert.ok(metrics.mixed_pairs > 0)
})

test("focus on user 7 keeps his seats and offers different tablemates in both rounds", () => {
  const participants = Array.from({ length: 42 }, (_, i) => ({ number: i + 1, name: `P${i + 1}`, gender: i % 2 ? "female" : "male", age: 26 + i % 6 }))
  const generated = buildSixBySevenPlan(participants.map(p => p.number), Object.fromEntries(participants.map(p => [p.number, p.gender])))
  const assignments = [generated.round1, generated.round2].flatMap((groups, i) => groups.flatMap((group, table) => group.map(participant_id => ({ round: i + 1, table_number: table + 1, participant_id }))))
  const original = structuredClone(assignments)
  const scores = new Map(participants.flatMap(a => participants.filter(b => b.number > a.number).map(b => [`${a.number}-${b.number}`, 70])))
  for (const seed of [7, 41, 109]) {
    const result = buildSeatingAlternatives({ assignments, participants, scores, focusNumber: 7, random: seeded(seed) })
    assert.equal(result.alternatives.length, 3)
    for (const plan of result.alternatives) {
      assert.deepEqual(plan.assignments.filter(row => row.participant_id === 7), canonicalSeating(assignments.filter(row => row.participant_id === 7)))
      assert.deepEqual(tableCounts(plan.assignments), tableCounts(assignments))
      assert.deepEqual(tableGenders(plan.assignments, participants), tableGenders(assignments, participants))
      assert.equal(plan.metrics.repeated_pairs, result.current.metrics.repeated_pairs)
      assert.equal(plan.focus.repeated_partners, result.current.focus.repeated_partners)
      assert.equal(plan.focus.compatibility, 70)
      assert.ok(plan.focus.new_companions.every(group => group.length && group.some(number => participants[number - 1].gender === "female")))
    }
    for (const round of [0, 1]) assert.equal(new Set(result.alternatives.map(plan => JSON.stringify(plan.focus.companions[round]))).size, 3)
  }
  assert.deepEqual(assignments, original)
  assert.throws(() => buildSeatingAlternatives({ assignments, participants, focusNumber: 99999 }), /غير موجود/)
})

test("the preview request uses the selected focus while general alternatives remain available", async () => {
  const { participants, assignments } = fixture()
  const tables = { event_state: { current_event_id: 26, phase: "setup", test_mode_active: false }, event3_participants: participants.map(p => ({ participant_number: p.number })), session_assignments: assignments, locked_matches: [], event3_exclusions: [], participants: participants.map(p => ({ assigned_number: p.number, ...p })) }
  const db = { from(table) { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, single: () => q, then: resolve => resolve({ data: tables[table] }) }; return q } }
  const request = { db, action: "e3-get-seating-alternatives", body: { expected_event_id: 26, expected_test_mode: false, focus_number: 7 }, eventId: 26, secret: "test-secret", loadScores: async () => new Map() }
  const focused = await handleSeatingAlternatives(request)
  assert.equal(focused.focus_number, 7)
  assert.equal(focused.current.focus.number, 7)
  assert.ok(focused.alternatives.length > 0)
  const general = await handleSeatingAlternatives({ ...request, body: { ...request.body, focus_number: null } })
  assert.equal(general.focus_number, null)
  assert.equal(general.current.focus, undefined)
})
