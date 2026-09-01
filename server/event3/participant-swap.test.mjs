import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"
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
  assert.deepEqual(getTableSwapRounds(1), [1, 2, 3])
  assert.deepEqual(getTableSwapRounds(2), [1, 2, 3])
  assert.deepEqual(getTableSwapRounds(3), [1, 2, 3])
  assert.deepEqual(getTableSwapRounds(20), [20])
  assert.deepEqual(getTableSwapRounds(30), [30])
  assert.equal(getTableSwapRounds(4), null)
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

test("match swaps submit both pair scores in live and test mode", async t => {
  const source = await readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8")
  const handler = source.slice(
    source.indexOf('if (action === "e3-swap-match-partner")'),
    source.indexOf('// e3-replace-participant'),
  )

  for (const testMode of [false, true]) {
    for (const phase of ["phase2", "phase3"]) {
      for (const replacementPartner of [40, null]) {
        await t.test(`${testMode ? "test" : "live"} ${phase}, replacement ${replacementPartner == null ? "unpaired" : "paired"}`, async () => {
          const scoringCalls = [], writes = [], refreshes = []
          const partnerField = `${phase}_partner`
          const rows = [
            { participant_number: 10, [partnerField]: 30 },
            { participant_number: 30, [partnerField]: 10 },
            { participant_number: 20, [partnerField]: replacementPartner },
            ...(replacementPartner == null ? [] : [{ participant_number: 40, [partnerField]: 20 }]),
          ]
          const profiles = [10, 20, 30, 40].map(assigned_number => ({ assigned_number }))
          const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
          await runInNewContext(`(async () => { ${handler} })()`, {
            action: "e3-swap-match-partner",
            req: { body: { phase, missing_participant: 10, replacement_participant: 20, expected_missing_partner: 30, expected_replacement_partner: replacementPartner } },
            res,
            EVENT3_MATCH_ID: "event3-fixture",
            STATIC_MATCH_ID: "main-fixture",
            currentEventId: 26,
            loadEvent3Format: async () => "classic",
            isChoiceOnlyEvent3: () => false,
            supabase: {
              from(table) {
                assert.ok(["event3_matches", "participants"].includes(table))
                return {
                  select() { return this }, eq() { return this }, in() { return this },
                  then(resolve) { resolve({ data: table === "event3_matches" ? rows : profiles, error: null }) },
                }
              },
              async rpc(name, params) { writes.push({ name, params }); return { error: null } },
            },
            getEvent3TestContext: async () => ({ active: testMode, eventId: 26 }),
            e3FullCalcCompat: async (a, b, options) => {
              scoringCalls.push({ a: a.assigned_number, b: b.assigned_number, skipCacheWrite: options.skipCacheWrite })
              return { total: a.assigned_number + b.assigned_number, reason: `Pair ${a.assigned_number}-${b.assigned_number}` }
            },
            buildEvent3ScoreProvenance: score => ({ persistedScore: score.total, scoreModelVersion: "fixture", scoreContentHash: "fixture-hash", scoreSnapshot: { total: score.total } }),
            isStoredBalancedScoreSnapshot: () => true,
            refreshEvent3TestMatchResults: async eventId => { refreshes.push(eventId) },
          })

          assert.equal(res.statusCode, 200)
          assert.equal(writes.length, 1)
          assert.equal(writes[0].name, phase === "phase3" ? "replace_event3_algorithm_match_partner" : "swap_event3_match_partner")
          const { params } = writes[0]
          assert.equal(params.p_event_id, 26)
          assert.equal(params.p_first_score.reason, "Pair 20-30")
          assert.equal(params.p_first_score.score, 50)
          if (replacementPartner == null) {
            assert.equal(params.p_second_score, null)
          } else {
            assert.equal(params.p_second_score.reason, "Pair 10-40")
            assert.equal(params.p_second_score.score, 50)
          }
          assert.deepEqual(scoringCalls, [
            { a: 20, b: 30, skipCacheWrite: testMode },
            ...(replacementPartner == null ? [] : [{ a: 10, b: 40, skipCacheWrite: testMode }]),
          ])
          if (phase === "phase3") assert.equal(params.p_sync_locked_matches, !testMode)
          assert.deepEqual(refreshes, testMode ? [26] : [])
        })
      }
    }
  }
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
  assert.match(adminUi, /expected_missing_partner:\s*immediateReplacementPreview\.missing_partner\?\.number/)
  assert.match(adminUi, /expected_replacement_partner:\s*immediateReplacementPreview\.replacement_partner\?\.number \?\? null/)
  assert.match(adminApi, /const swapRpc = phase === "phase3" \? "replace_event3_algorithm_match_partner"/)
  assert.match(swapApi, /missingPartner !== expectedMissingPartner \|\| replacementPartner !== expectedReplacementPartner/)
  assert.match(swapApi, /algorithm matches changed after this preview/)
  assert.match(swapApi, /skipCacheWrite: isActiveTestSwap/)
  assert.match(swapApi, /p_sync_locked_matches: !isActiveTestSwap/)
  assert.match(swapApi, /if \(isActiveTestSwap\) await refreshEvent3TestMatchResults/)
  assert.match(migration, /create or replace function public\.replace_event3_algorithm_match_partner/)
  assert.match(migration, /if coalesce\(p_sync_locked_matches, true\) then/)
  assert.match(testIsolationMigration, /'event3_matches',[\s\S]*'session_assignments'/)
  assert.match(testIsolationMigration, /insert into public\.event3_matches[\s\S]*v_snapshot -> 'event3_matches'/)
})
