import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const api = readFileSync(new URL("../../api/admin/index.mjs", import.meta.url), "utf8")
const migration = readFileSync(new URL("../../supabase/migrations/20260830001700_event3_cohost_notes_and_lock.sql", import.meta.url), "utf8")
const action = name => api.split(`if (action === "${name}") {`)[1]?.split(/\n\s*\/\/ e3-/)[0] || ""
const rpc = name => migration.split(`create or replace function public.${name}(`)[1]?.split("$$;")[0] || ""

test("new preparation RPCs are invoker-only and denied to public browser roles", () => {
  for (const name of ["assert_event3_prepared_test_algorithm", "begin_event3_test_mode_with_prepared_algorithm", "prepare_event3_test_algorithm_if_empty", "activate_event3_prepared_test_algorithm"]) {
    assert.match(rpc(name), /security invoker/)
    assert.match(rpc(name), /set search_path = ''/)
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}\\([^;]+from public, anon, authenticated;`))
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role;`))
  }
})

test("test start and preparation keep runtime writes out of pre-phase3 transactions", () => {
  const begin = rpc("begin_event3_test_mode_with_prepared_algorithm")
  assert.ok(begin.indexOf("begin_event3_test_mode_with_group_feedback") < begin.indexOf("assert_event3_prepared_test_algorithm"))
  assert.ok(begin.indexOf("assert_event3_prepared_test_algorithm") < begin.indexOf("replace_event3_test_match_results"))
  for (const name of ["begin_event3_test_mode_with_prepared_algorithm", "prepare_event3_test_algorithm_if_empty"]) {
    assert.doesNotMatch(rpc(name), /(?:insert into|update|delete from) public\.(?:event3_matches|session_assignments)\b/)
    assert.match(rpc(name), /table_number.*is not null/)
  }
  const start = action("e3-start-test-mode")
  assert.ok(start.indexOf("buildPreparedEvent3TestAlgorithmRows") < start.indexOf('supabase.rpc("begin_event3_test_mode_with_prepared_algorithm"'))
  const builder = api.split("async function buildPreparedEvent3TestAlgorithmRows")[1].split("async function refreshEvent3TestMatchResults")[0]
  assert.match(builder, /skipCacheWrite: true/)
  assert.match(builder, /skipUsageUpdate: true/)
  assert.match(builder, /validatePreparedTestAlgorithmRows/)
})

test("legacy preparation is explicit admin-only and returns an existing locked winner unchanged", () => {
  const allowlist = api.split("const EVENT3_COHOST_ACTIONS = new Set([")[1].split("])")[0]
  assert.doesNotMatch(allowlist, /e3-prepare-test-algorithm/)
  assert.match(action("e3-prepare-test-algorithm"), /if \(!hasAdminAccess\)/)
  const prepare = rpc("prepare_event3_test_algorithm_if_empty")
  assert.ok(prepare.indexOf("pg_advisory_xact_lock") < prepare.indexOf("jsonb_agg"))
  assert.ok(prepare.indexOf("'reused', true") < prepare.indexOf("replace_event3_test_match_results"))
  assert.match(prepare, /phase3_partner is not null/)
})

test("phase3 test path reuses saved pairs through a transaction without randomizing or scoring", () => {
  const phase3 = action("e3-trigger-phase3-matching")
  const testPath = phase3.split("if (isTestMode3) {")[1].split("} else {")[0]
  assert.match(testPath, /getEvent3TestMatchRows/)
  assert.match(testPath, /validatePreparedTestAlgorithmRows/)
  assert.match(testPath, /activate_event3_prepared_test_algorithm/)
  assert.doesNotMatch(testPath, /calculateFullCompatibilityWithCache|e3FullCalcCompat|e3RandomPairMatching|\.upsert\(|\.delete\(/)
  const activate = rpc("activate_event3_prepared_test_algorithm")
  assert.ok(activate.indexOf("assert_event3_prepared_test_algorithm") < activate.indexOf("insert into public.event3_matches"))
  assert.match(activate, /Existing phase-3 matches conflict/)
  assert.match(activate, /prepared\.score_model_version, prepared\.score_snapshot, prepared\.score_content_hash/)
  assert.doesNotMatch(activate, /replace_event3_test_match_results|(?:insert into|update|delete from) public\.(?:locked_matches|match_results|compatibility_cache)\b/)
})

test("database validation protects session identity, complete roster, exclusions and score snapshots", () => {
  const validation = rpc("assert_event3_prepared_test_algorithm")
  assert.match(validation, /started_at'\) is distinct from p_expected_started_at/)
  assert.match(validation, /v_roster is distinct from v_expected/)
  assert.match(validation, /v_incoming is distinct from v_roster/)
  assert.match(validation, /join public\.event3_exclusions/)
  assert.match(validation, /scoreBreakdown/)
  assert.match(validation, /questionScores/)
  assert.match(validation, /vibeAxes/)
  assert.match(validation, /'totalScore'\)::numeric is distinct from/)
  assert.match(api, /if \(!matchRows\?\.length\) return existingRows\?\.length \|\| 0/)
  assert.match(action("e3-get-test-mode"), /prepared_algorithm_pairs: preparedAlgorithmCount \|\| 0/)
})

test("test feedback cleanup preserves prepared matches and requires the locked active test event", () => {
  const cleanup = rpc("clear_event3_test_data")
  assert.match(cleanup, /security invoker/)
  assert.match(cleanup, /set search_path = ''/)
  assert.match(cleanup, /event3-test-mode:/)
  assert.doesNotMatch(cleanup, /event3-clear-test-data:/)
  assert.match(cleanup, /for update;/)
  assert.match(cleanup, /v_state\.current_event_id is distinct from p_event_id/)
  assert.match(cleanup, /v_state\.test_mode_active is not true/)
  assert.ok(cleanup.indexOf("raise exception 'Test data can only be cleared") < cleanup.indexOf("delete from"))
  assert.doesNotMatch(cleanup, /(?:insert into|update|delete from) public\.(?:event3_test_match_results|event3_participants|session_assignments|locked_matches|match_results|compatibility_cache)\b/)
  for (const table of ["participant_rankings", "event3_group_reflections", "event3_group_member_feedback", "event3_participant_notes", "event3_mood_checks", "event3_notifications", "event3_ai_welcome_messages", "organizer_requests"]) {
    assert.match(cleanup, new RegExp(`delete from public\\.${table}\\b`))
  }
  assert.match(cleanup, /event3_group_member_feedback\s+where match_id = v_state\.match_id and event_id = p_event_id and is_test_mode = true/)
  assert.match(cleanup, /set phase2_feedback = null, phase3_feedback = null, phase2_word = null,\s+phase3_word = null, match_preference = null/)
  assert.doesNotMatch(cleanup, /(?:phase2_partner|phase3_partner|phase2_score|phase3_score)\s*=/)
  assert.match(migration, /revoke execute on function public\.clear_event3_test_data\(integer\) from public, anon, authenticated;/)
  assert.match(migration, /grant execute on function public\.clear_event3_test_data\(integer\) to service_role;/)
  assert.match(action("e3-clear-test-data"), /rpc\("clear_event3_test_data_v2",\s*\{\s*p_event_id: Number\(currentEventId\),\s*p_expected_started_at: displayedEvent3Context\.testSessionKey/)
})
