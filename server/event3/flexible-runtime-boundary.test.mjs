import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const api = await readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8")
const participantApi = await readFile(new URL("../../api/participant.mjs", import.meta.url), "utf8")
const migration = await readFile(new URL(
  "../../supabase/migrations/20260905125242_harden_event3_variable_test_runtime.sql",
  import.meta.url,
), "utf8")
const flexibleRosterMigration = await readFile(new URL(
  "../../supabase/migrations/20260906022606_allow_flexible_event3_rosters.sql",
  import.meta.url,
), "utf8")

function action(name, nextMarker) {
  const start = api.indexOf(`if (action === "${name}") {`)
  assert.notEqual(start, -1, `missing ${name}`)
  const end = nextMarker ? api.indexOf(nextMarker, start) : -1
  return api.slice(start, end === -1 ? undefined : end)
}

test("all three choice slots require complete roster coverage rather than a 42-person constant", () => {
  const first = action("e3-trigger-phase2-matching", "// e3-trigger-phase3-matching")
  const second = action("e3-trigger-phase3-matching", "// e3-trigger-phase4-matching")
  const third = action("e3-trigger-phase4-matching", "// e3-get-group-member-feedback")
  assert.match(first, /pairs\.length !== \(e3p \|\| \[\]\)\.length \/ 2/)
  assert.match(second, /secondChoice\.pairs\.length !== nums\.length \/ 2/)
  assert.match(third, /thirdChoice\.pairs\.length !== participantNumbers\.length \/ 2/)
  assert.doesNotMatch(third, /pairs\.length !== 21/)
})

test("one-to-one matching is phase-gated and every choice round opens its processing phase", () => {
  const first = action("e3-trigger-phase2-matching", "// e3-trigger-phase3-matching")
  const second = action("e3-trigger-phase3-matching", "// e3-trigger-phase4-matching")
  const third = action("e3-trigger-phase4-matching", "// e3-get-group-member-feedback")

  assert.match(first, /!\[finalRankingPhase, "phase2_processing"\]\.includes\(tmState2\.phase\)/)
  assert.match(second, /tmState3\?\.phase !== "phase2_reveal"/)
  assert.match(second, /phase: "phase3_processing"/)
  assert.match(third, /phase4State\?\.phase !== "phase3_reveal"/)
  assert.match(third, /phase: "phase4_processing"/)
  assert.match(third, /matching_committed: true/)
})

test("second-choice atomic save retains its ranking snapshot outside the query block", () => {
  const second = action("e3-trigger-phase3-matching", "// e3-trigger-phase4-matching")
  assert.match(second, /let choiceExpectedRankings = \[\]/)
  assert.match(second, /choiceExpectedRankings = event3ChoiceRankingSnapshot\(rankResult\.data \|\| \[\]\)/)
  assert.match(second, /p_expected_rankings: choiceExpectedRankings/)
  assert.doesNotMatch(second, /p_expected_rankings: event3ChoiceRankingSnapshot\(rankResult\.data/)
})

test("admin readiness is based on exact seating and reciprocal match coverage", () => {
  const state = action("e3-get-state", "// e3-get-participants")
  assert.match(state, /buildEvent3RuntimeReadiness/)
  assert.match(state, /seating_generated: readiness\.seating\.complete/)
  assert.match(state, /phase2_matches_done: readiness\.phase2\.complete/)
  assert.match(state, /phase4_matches_done: stateChoiceOnly \? readiness\.phase4\.complete : false/)
  assert.match(state, /runtime_readiness: readiness/)
})

test("choice test mode automatically selects the largest balanced pool of fully completed profiles", () => {
  const start = action("e3-start-test-mode", "// e3-end-test-mode")
  assert.doesNotMatch(start, /req\.body\?\.participant_count/)
  assert.doesNotMatch(start, /savedRosterCount/)
  assert.match(start, /isParticipantComplete\(p\)/)
  assert.match(start, /largestBalancedChoiceCount/)
  assert.match(start, /Math\.min\(males\.length, females\.length\) \* 2/)
  assert.match(start, /\? largestBalancedChoiceCount\s+: 36/)
  assert.match(start, /requiredPerGender = requiredParticipants \/ 2/)
  assert.doesNotMatch(start, /choiceOnlyTest \? 21 : 18/)
})

test("test runtime snapshots and restores attendance, support, and reflections", () => {
  for (const key of ["event_attendance", "organizer_requests", "event3_group_reflections"]) {
    assert.match(migration, new RegExp(`'${key}'`))
    assert.match(migration, new RegExp(`jsonb_populate_recordset\\(\\s*null::public\\.${key}`))
  }
  assert.match(migration, /v_selected_count < 16 or v_selected_count > 42 or v_selected_count % 2 <> 0/)
  assert.match(flexibleRosterMigration, /v_selected_count < 6 or v_selected_count % 2 <> 0/)
  assert.doesNotMatch(flexibleRosterMigration, /v_selected_count < 6 or v_selected_count > 42/)
  assert.match(migration, /delete from public\.event3_choice_seating_reports[\s\S]*is_test_mode = true/)
})

test("attendance and support mutations are session-aware across test-mode transitions", () => {
  assert.match(migration, /create or replace function public\.assert_event3_auxiliary_session/)
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]*event3-test-mode:/)
  assert.match(migration, /create or replace function public\.set_event3_attendance_v2/)
  assert.match(migration, /create or replace function public\.send_event3_support_message_v2/)
  assert.match(migration, /create or replace function public\.append_event3_support_message_v2/)
  assert.match(migration, /create or replace function public\.set_event3_support_status_v2/)
  assert.match(migration, /create or replace function public\.reset_event3_support_requests_v2/)

  const cohostAttendance = action("e3-cohost-set-attendance", 'if (action === "e3-cohost-resolve-sos"')
  const adminAttendance = action("e3-set-attendance", "// Explicit admin-only backfill")
  const adminSupport = action("e3-sos-initiate", "// e3-get-feedback")
  assert.match(cohostAttendance, /rpc\("set_event3_attendance_v2"/)
  assert.match(adminAttendance, /rpc\("set_event3_attendance_v2"/)
  assert.match(adminSupport, /rpc\("send_event3_support_message_v2"/)
  assert.match(adminSupport, /rpc\("append_event3_support_message_v2"/)
  assert.match(adminSupport, /rpc\("set_event3_support_status_v2"/)
  assert.match(adminSupport, /rpc\("reset_event3_support_requests_v2"/)
  assert.match(participantApi, /rpc\("set_event3_attendance_v2"/)
  assert.match(participantApi, /rpc\("send_event3_support_message_v2"/)
})

test("co-host timers receive server time and admin feedback edits use participant validation", () => {
  const dashboard = action("e3-cohost-dashboard", 'if (action === "e3-cohost-rankings")')
  assert.match(dashboard, /dashboardServerNow/)
  assert.match(dashboard, /server_now: dashboardServerNow/)
  const edit = action("e3-edit-feedback", "// e3-preview-match-partner-swap")
  assert.match(edit, /normalizeEvent3FeedbackPayload\(feedback\)/)
  assert.match(edit, /Participant has no match row in the current event/)
  assert.match(edit, /Feedback cannot be saved before this participant has a partner/)
  assert.match(edit, /\.select\(`participant_number,\$\{partnerField\}`\)[\s\S]*\.maybeSingle\(\)/)
  assert.match(edit, /rpc\("edit_event3_feedback_v2"/)
})

test("admin phase, timer, feedback, ranking, and lifecycle writes stay inside the displayed Event3 session", () => {
  const phase = action("e3-set-phase", "// e3-start-timer")
  const timer = action("e3-start-timer", "// e3-stop-timer")
  const stop = action("e3-stop-timer", "// e3-adjust-timer")
  const adjust = action("e3-adjust-timer", "// e3-get-rankings-status")
  const feedbackClear = action("e3-delete-feedback", "// e3-edit-feedback")
  const endTest = action("e3-end-test-mode", "// e3-get-test-mode")
  const clearTest = action("e3-clear-test-data", "// e3-clear-mood-checks")
  const exclusion = action("e3-toggle-phase2-exclusion", "// e3-trigger-phase2-matching")

  assert.match(phase, /rpc\("set_event3_phase_v2"/)
  assert.match(timer, /rpc\("start_event3_timer_v2"/)
  assert.match(stop, /rpc\("stop_event3_timer_v2"/)
  assert.match(adjust, /rpc\("adjust_event3_timer_v2"/)
  assert.match(feedbackClear, /rpc\("clear_event3_feedback_v2"/)
  assert.match(exclusion, /rpc\("toggle_event3_phase2_exclusion_v2"/)
  assert.match(exclusion, /typeof expected_excluded !== "boolean"/)
  assert.match(exclusion, /p_expected_excluded: expected_excluded/)
  assert.doesNotMatch(exclusion, /select\("phase2_excluded"\)/)
  assert.match(endTest, /rpc\("end_event3_test_mode_v2"/)
  assert.match(clearTest, /rpc\("clear_event3_test_data_v2"/)
  for (const block of [phase, timer, stop, adjust, feedbackClear, exclusion]) {
    assert.match(block, /displayedEvent3Context\.params/)
  }
})

test("participant ranking expiry and admin ranking tools use session-aware atomic RPCs", () => {
  assert.match(participantApi, /rpc\("complete_event3_rankings_v2"/)
  assert.doesNotMatch(participantApi, /rpc\("complete_event3_rankings"/)
  assert.match(participantApi, /rpc\("save_event3_ranking_v2"/)
  assert.doesNotMatch(participantApi, /rpc\("save_event3_ranking"/)
  for (const rpc of [
    "complete_event3_rankings_v2",
    "replace_event3_admin_ranking_order_v2",
    "replace_event3_admin_rankings_v2",
    "clear_event3_participant_ranking_v2",
    "clear_event3_rankings_v2",
  ]) {
    assert.match(api, new RegExp(`rpc\\("${rpc}"`))
  }
})
