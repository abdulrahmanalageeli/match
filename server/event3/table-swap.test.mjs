import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("one-to-one table controls use the atomic v2 swap and keep test results synchronized", async () => {
  const [adminApi, adminUi, migration] = await Promise.all([
    readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../app/routes/admin3.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/migrations/20260829132058_sync_event3_test_table_swaps.sql", import.meta.url), "utf8"),
  ])

  const moveApi = adminApi.slice(
    adminApi.indexOf('if (action === "e3-move-table")'),
    adminApi.indexOf('// e3-swap-table-numbers'),
  )
  const choiceTableUi = adminUi.slice(
    adminUi.indexOf('1:1 Pairs View'),
    adminUi.indexOf('Object.keys(seating?.[mapRound]'),
  )

  assert.match(adminApi, /rpc\("swap_event3_table_numbers_v2"/)
  assert.match(moveApi, /if \(!\[1, 2, 3\]\.includes\(assignmentRound\)\)/)
  assert.match(moveApi, /One-to-one rounds must use the atomic table swap/)
  assert.match(choiceTableUi, /renameTable\(20, pair\.table, targetTable\)/)
  assert.doesNotMatch(choiceTableUi, /api\("e3-move-table"/)

  assert.match(migration, /create or replace function public\.swap_event3_table_numbers_v2/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /update public\.session_assignments/)
  assert.match(migration, /update public\.event3_test_match_results/)
  assert.match(migration, /security invoker/)
  assert.match(migration, /grant execute[\s\S]*to service_role/)
})
