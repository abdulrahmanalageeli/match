import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  collectEventSwapPairs,
  collectMatchResultSwapPairs,
  getTableSwapRounds,
  swapNumber,
} from "./participant-swap.mjs"

test("swapNumber supports a full swap and a one-way replacement", () => {
  assert.equal(swapNumber(10, 10, 20, true), 20)
  assert.equal(swapNumber(20, 10, 20, true), 10)
  assert.equal(swapNumber(20, 10, 20, false), 20)
  assert.equal(swapNumber(30, 10, 20, true), 30)
})

test("one-to-one table numbers swap only in their own phase", () => {
  assert.deepEqual(getTableSwapRounds(1), [1, 2])
  assert.deepEqual(getTableSwapRounds(2), [1, 2])
  assert.deepEqual(getTableSwapRounds(20), [20])
  assert.deepEqual(getTableSwapRounds(30), [30])
  assert.equal(getTableSwapRounds(3), null)
})

test("event pair planning keeps reciprocal pairs unique and maps both identities", () => {
  const rows = [
    { participant_number: 10, phase2_partner: 30, phase3_partner: 40 },
    { participant_number: 30, phase2_partner: 10, phase3_partner: null },
    { participant_number: 20, phase2_partner: 50, phase3_partner: 60 },
    { participant_number: 50, phase2_partner: 20, phase3_partner: null },
  ]

  assert.deepEqual(collectEventSwapPairs(rows, 10, 20, true), [
    { phase: "phase2", a: 20, b: 30 },
    { phase: "phase3", a: 20, b: 40 },
    { phase: "phase2", a: 10, b: 50 },
    { phase: "phase3", a: 10, b: 60 },
  ])
})

test("regular result planning swaps locked one-to-one partners but ignores group rows", () => {
  const rows = [
    { id: "a", participant_a_number: 10, participant_b_number: 30, participant_c_number: null },
    { id: "b", participant_a_number: 20, participant_b_number: 40, participant_c_number: null },
    { id: "group", participant_a_number: 10, participant_b_number: 50, participant_c_number: 60 },
  ]

  assert.deepEqual(collectMatchResultSwapPairs(rows, 10, 20), [
    { id: "a", a: 20, b: 30 },
    { id: "b", a: 10, b: 40 },
  ])
})

test("admin3 algorithm replacement is searchable, gender-neutral, previewed, and isolated in test mode", async () => {
  const [adminApi, adminUi, migration, testIsolationMigration] = await Promise.all([
    readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../app/routes/admin3.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/migrations/20260827013912_clean_event3_algorithm_match_replacement.sql", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/migrations/20260813181110_event3_isolated_test_match_results.sql", import.meta.url), "utf8"),
  ])
  const previewApi = adminApi.slice(
    adminApi.indexOf('if (action === "e3-preview-match-partner-swap")'),
    adminApi.indexOf('// e3-swap-match-partner'),
  )
  const replacementModal = adminUi.slice(
    adminUi.indexOf('Immediate Algorithm Replacement Modal'),
    adminUi.indexOf('Swap Match Modal'),
  )
  const swapApi = adminApi.slice(
    adminApi.indexOf('if (action === "e3-swap-match-partner")'),
    adminApi.indexOf('// e3-replace-participant'),
  )

  assert.match(previewApi, /Both people must be selected for the current Event3 event/)
  assert.match(previewApi, /Promise\.all\(\[\s*calculatePreviewPair/)
  assert.match(previewApi, /before:[\s\S]*after:/)
  assert.match(previewApi, /skipCacheWrite: skipPreviewCacheWrite/)
  assert.match(replacementModal, /immediateReplacementSearch/)
  assert.match(replacementModal, /String\(p\.name[\s\S]*String\(p\.number\)/)
  assert.match(replacementModal, /person\?\.mbti[\s\S]*person\?\.attachment[\s\S]*person\?\.communication/)
  assert.match(replacementModal, /previewReady/)
  assert.doesNotMatch(replacementModal, /restrictGender|normalizedGender/)
  assert.match(adminApi, /const swapRpc = phase === "phase3" \? "replace_event3_algorithm_match_partner"/)
  assert.match(swapApi, /skipCacheWrite: isActiveTestSwap/)
  assert.match(swapApi, /p_sync_locked_matches: !isActiveTestSwap/)
  assert.match(swapApi, /if \(isActiveTestSwap\) await refreshEvent3TestMatchResults/)
  assert.match(migration, /create or replace function public\.replace_event3_algorithm_match_partner/)
  assert.match(migration, /if coalesce\(p_sync_locked_matches, true\) then/)
  assert.match(testIsolationMigration, /'event3_matches',[\s\S]*'session_assignments'/)
  assert.match(testIsolationMigration, /insert into public\.event3_matches[\s\S]*v_snapshot -> 'event3_matches'/)
})
