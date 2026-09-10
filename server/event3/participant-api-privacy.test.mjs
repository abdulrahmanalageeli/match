import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const participantApiPath = new URL("../../api/participant.mjs", import.meta.url)
const adminApiPath = new URL("../../api/admin/index.mjs", import.meta.url)

function between(source, start, end) {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

test("participant one-to-one reveals do not disclose inferred partner profile labels", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const revealSource = between(source, '// e3-get-phase2-reveal', 'if (action === "e3-submit-phase4-word")')

  for (const privateField of [
    "partner_mbti",
    "partner_attachment",
    "partner_communication",
    "partner_age",
  ]) {
    assert.doesNotMatch(revealSource, new RegExp(privateField))
  }
  assert.doesNotMatch(revealSource, /select\("assigned_number,name,survey_data,mbti_personality_type,age"\)/)
})

test("full-analysis export never selects or returns exact participant memory words", async () => {
  const source = await readFile(adminApiPath, "utf8")
  const exportSource = between(source, 'action === "e3-export-full-analysis"', 'action === "set-registration-enabled"')

  for (const privateField of ["phase2_word", "phase3_word", "phase4_word", "a_word", "b_word"]) {
    assert.doesNotMatch(exportSource, new RegExp(privateField))
  }
})

test("final reveal exposes explicit readiness and never substitutes a dash for missing profile data", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const finalRevealSource = between(source, '// e3-get-final-reveal', '// e3-get-notes')

  assert.match(finalRevealSource, /ready: true/)
  assert.doesNotMatch(finalRevealSource, /partnerName \|\| "—"/)
  assert.match(finalRevealSource, /missingPartnerProfile/)
})

test("heartbeat auxiliary outages cannot replace a fresh core state with HTTP 503", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const heartbeatSource = between(source, '// Heartbeat: also fetch SOS', 'return res.status(200).json(baseResponse)')

  assert.match(heartbeatSource, /Promise\.allSettled/)
  assert.match(heartbeatSource, /buildEvent3AuxiliaryHeartbeat/)
  assert.doesNotMatch(heartbeatSource, /return res\.status\(503\)/)
})

test("ranking writes preserve the original complete saved-order contract", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const rankingSource = between(source, '// Drafts and final submissions share the event lock', '// e3-get-phase2-reveal')

  assert.match(rankingSource, /const \{ ranked_list, auto_saved \} = req\.body/)
  assert.match(rankingSource, /ranked_list\.length === 0/)
  assert.match(rankingSource, /p_ranked_numbers: normalizedRanking/)
  assert.doesNotMatch(rankingSource, /not_met_numbers|p_not_met_numbers|not_met_supported/)
})

test("group assignment revision changes when same-table membership changes", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const assignment = between(source, '// e3-get-assignment', '// Table-scoped coordinator election')

  assert.match(assignment, /tablemate_signature: tablemateSignature/)
  assert.match(assignment, /membershipNumbers: mateNums/)
})

test("ranking bootstrap distinguishes dependency failures without changing saved-order semantics", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const rankingBootstrap = between(source, '// e3-get-participants-met', '// Optional absolute feedback')

  assert.match(rankingBootstrap, /assignmentsError/)
  assert.match(rankingBootstrap, /tablematesError/)
  assert.match(rankingBootstrap, /profilesError/)
  assert.match(rankingBootstrap, /draft_order: pendingDraft \? draft\.ranked_numbers : null/)
  assert.match(rankingBootstrap, /already_submitted: !pendingDraft && nums\.every/)
  assert.doesNotMatch(rankingBootstrap, /not_met_numbers|has_ranking_intent|not_met_supported/)
  assert.doesNotMatch(rankingBootstrap, /const \{ data: (?:allRounds|mates|pdata) \} = await/)
})

test("group coordination mutations log database details but return stable Arabic errors", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const coordination = between(source, '// Table-scoped coordinator election', '// e3-get-participants-met')

  assert.match(coordination, /logError\("Event3 group coordination mutation", error\)/)
  assert.match(coordination, /EVENT3_GROUP_COORDINATION_SAVE_FAILED/)
  assert.match(coordination, /EVENT3_GROUP_COORDINATION_CHANGED/)
  assert.match(coordination, /EVENT3_MIGRATION_REQUIRED/)
  assert.doesNotMatch(coordination, /error: message/)
})

test("feedback writes bind the submitted form to the current partner and assignment revision", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const guard = between(source, 'function validateEvent3ExpectedAssignment', 'function event3FeedbackMeetingMetadata')
  const liveSubmits = between(source, '// e3-submit-phase2-feedback', '// e3-submit-match-preference')
  const remoteSubmit = between(source, '// e3-submit-feedback-remote', 'return res.status(400).json({ error: `Unknown e3 action')

  assert.match(guard, /expected_partner/)
  assert.match(guard, /expected_assignment_revision/)
  assert.match(guard, /EVENT3_CLIENT_REFRESH_REQUIRED/)
  assert.match(guard, /refresh_required: true/)
  assert.match(guard, /EVENT3_ASSIGNMENT_CHANGED/)
  assert.match(guard, /res\.status\(409\)/)
  assert.equal((liveSubmits.match(/validateEvent3ExpectedAssignment/g) || []).length, 3)
  assert.match(remoteSubmit, /validateEvent3ExpectedAssignment/)
})

test("memory-word writes validate the current partner and assignment revision before every write", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const wordSubmits = [
    between(source, '// e3-submit-phase2-word', '// e3-get-phase3-reveal'),
    between(source, '// e3-submit-phase3-word', '// Choice-only Match 3 reveal and word'),
    between(source, 'if (action === "e3-submit-phase4-word")', '// e3-submit-phase2-feedback'),
  ]

  for (const endpoint of wordSubmits) {
    assert.match(endpoint, /session_assignments/)
    assert.match(endpoint, /validateEvent3ExpectedAssignment/)
    assert.ok(endpoint.indexOf('validateEvent3ExpectedAssignment') < endpoint.indexOf('saveEvent3MatchInteraction'))
  }
})

test("one-to-one reveals return only sanitized canonical feedback and its fingerprint", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const reveals = between(source, '// e3-get-phase2-reveal', '// e3-submit-phase2-feedback')

  assert.equal((reveals.match(/sanitizeEvent3SavedFeedback\(matchRow\.phase[234]_feedback\)/g) || []).length, 3)
  assert.equal((reveals.match(/saved_feedback: savedFeedback/g) || []).length, 3)
  assert.equal((reveals.match(/feedback_fingerprint: savedFeedback/g) || []).length, 3)
})

test("every Event3 result card carries the recorded meeting outcome", async () => {
  const source = await readFile(participantApiPath, "utf8")

  assert.match(source, /meeting_status: meetingStatus/)
  assert.match(source, /meeting_occurred: feedback\?\.meetingOccurred/)
  assert.equal((source.match(/\.\.\.event3FeedbackMeetingMetadata\(myFb[234]\)/g) || []).length, 6)
})

test("notes, current group, and support location reads never turn dependency errors into empty state", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const notes = between(source, '// e3-get-notes', '// e3-save-note')
  const group = between(source, '// e3-get-my-group', '// e3-sos —')
  const support = between(source, '// e3-sos —', '// e3-sos-check')

  assert.match(notes, /notesError/)
  for (const errorName of ["enrollmentError", "groupStateError", "groupAssignmentError", "tablematesError", "groupProfilesError"]) {
    assert.match(group, new RegExp(errorName))
  }
  assert.match(group, /reason: "assignment_pending"/)
  assert.match(support, /supportStateError/)
  assert.match(support, /supportSeatError/)
})

test("participant reflection, note, mood, and notification mutations never expose raw database errors", async () => {
  const source = await readFile(participantApiPath, "utf8")
  const branches = [
    between(source, '// Optional absolute feedback', '// Drafts and final submissions'),
    between(source, '// e3-save-note', '// e3-get-my-group'),
    between(source, '// e3-submit-mood-check', '// e3-get-notification'),
    between(source, '// e3-dismiss-notification', '// e3-ai-welcome'),
  ]

  for (const branch of branches) {
    assert.match(branch, /retryable:/)
    assert.doesNotMatch(branch, /json\(\{\s*error:\s*(?:feedbackResult\.)?error\.message/)
  }
  assert.match(branches[0], /EVENT3_GROUP_REFLECTION_(?:UNAVAILABLE|SAVE_FAILED)/)
  assert.match(branches[1], /EVENT3_NOTE_SAVE_FAILED/)
  assert.match(branches[2], /EVENT3_MOOD_SUBMIT_FAILED/)
  assert.match(branches[3], /EVENT3_NOTIFICATION_DISMISS_FAILED/)
})
