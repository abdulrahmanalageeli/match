import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { buildEvent3LiveSeatingScores } from "./live-seating-scores.mjs"

function profile(number, overrides = {}) {
  return {
    assigned_number: number,
    age: 25 + number,
    survey_data: { answers: {
      match_current_focus: [number <= 2 ? "career" : "family"],
      intent_goal: number <= 2 ? "A" : "C",
      core_values_1: number <= 2 ? "A" : "C",
      core_values_2: number <= 2 ? "A" : "C",
      core_values_3: number <= 2 ? "A" : "C",
      core_values_4: number <= 2 ? "A" : "C",
      core_values_5: number <= 2 ? "A" : "C",
      conversation_depth_pref: number <= 2 ? "A" : "B",
      match_disagreement_style: number <= 2 ? "A" : "D",
      communication_1: number <= 2 ? "A" : "C",
      communication_2: number <= 2 ? "A" : "C",
      communication_3: number <= 2 ? "A" : "C",
      communication_4: number <= 2 ? "A" : "C",
      communication_5: number <= 2 ? "A" : "C",
      lifestyle_1: number <= 2 ? "A" : "C",
      lifestyle_2: number <= 2 ? "A" : "C",
      lifestyle_3: number <= 2 ? "A" : "C",
      lifestyle_4: number <= 2 ? "A" : "C",
      lifestyle_5: number <= 2 ? "A" : "C",
      conversational_role: number % 3 === 1 ? "A" : number % 3 === 2 ? "B" : "C",
      curiosity_style: number % 2 ? "A" : "B",
      social_battery: number % 2 ? "A" : "B",
      humor_banter_style: number <= 2 ? "A" : "D",
      early_openness_comfort: number <= 2 ? 3 : 0,
      silence_comfort: number <= 2 ? "A" : "D",
      ...overrides,
    } },
  }
}

function assignments(groupsByRound) {
  return Object.entries(groupsByRound).flatMap(([round, groups]) => groups.flatMap((members, tableIndex) =>
    members.map(participantId => ({ round: Number(round), table_number: tableIndex + 1, participant_id: participantId }))))
}

test("live seating scores preserve table numbers and recalculate every lens after a swap", () => {
  const profiles = [1, 2, 3, 4, 5, 6].map(number => profile(number))
  const beforeAssignments = assignments({
    1: [[1, 2, 5], [3, 4, 6]],
    2: [[1, 2, 6], [3, 4, 5]],
    3: [[1, 2, 5], [3, 4, 6]],
  })
  const afterAssignments = beforeAssignments.map(row => ({
    ...row,
    table_number: row.participant_id === 2
      ? (row.table_number === 1 ? 2 : 1)
      : row.participant_id === 3 ? (row.table_number === 1 ? 2 : 1) : row.table_number,
  }))

  const before = buildEvent3LiveSeatingScores({ assignments: beforeAssignments, profiles })
  const after = buildEvent3LiveSeatingScores({ assignments: afterAssignments, profiles })

  assert.deepEqual([before[1].lens, before[2].lens, before[3].lens], ["spark", "depth", "rhythm"])
  assert.deepEqual(Object.keys(after[1].tables), ["1", "2"])
  for (const round of [1, 2, 3]) {
    assert.equal(Number.isFinite(after[round].score), true)
    assert.notDeepEqual(after[round].tables, before[round].tables)
  }
})

test("admin table map exposes a direct swap control and renders live lens scores", async () => {
  const [adminApi, adminUi] = await Promise.all([
    readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../app/routes/admin3.tsx", import.meta.url), "utf8"),
  ])
  const seatingApi = adminApi.slice(adminApi.indexOf('if (action === "e3-get-seating")'), adminApi.indexOf("// e3-toggle-score-reveal"))
  const seatingUi = adminUi.slice(adminUi.indexOf("{/* TAB: SEATING MAP"), adminUi.indexOf("{/* TAB: RANKING"))

  assert.match(seatingApi, /buildEvent3LiveSeatingScores/)
  assert.match(seatingApi, /group_scores: groupScores/)
  assert.match(seatingUi, /seatingScores\?\.\[mapRound\]\?\.tables\?\.\[table\]/)
  assert.match(seatingUi, /<Shuffle size=\{11\} \/> تبديل/)
})
