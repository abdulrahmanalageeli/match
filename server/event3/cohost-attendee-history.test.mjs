import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { buildCohostAttendeeHistory, loadCohostAttendeeHistory, redactCohostHistoryNote } from "./cohost-attendee-history.mjs"

const base = { target: 12, currentEventId: 26, profile: { name: "Attendee", age: 28, phone_number: "+966555555555", survey_data: { private: true } }, attendance: [{ event_id: 26, attended: true }], names: [{ assigned_number: 23, name: "Partner" }] }

test("history explicitly projects reciprocal ratings and redacts note contact details", () => {
  const result = buildCohostAttendeeHistory({ ...base, matches: [
    { event_id: 25, participant_number: 12, phase2_partner: 23, phase2_score: 82, phase2_feedback: { compatibilityRate: 70, conversationQuality: 4, personalConnection: 3, wantConnect: true, participantMessage: "private message", organizerImpression: "Warm conversation" } },
    { event_id: 25, participant_number: 23, phase2_partner: 12, phase2_feedback: { compatibilityRate: 85, conversationQuality: 5, personalConnection: 4, wantConnect: false, organizerImpression: "Friendly. Contact test@example.com +966 55 555 5555 https://secret.test/?token=abc" } },
  ] })
  const match = result.history[0].matches[0]
  assert.deepEqual(match.given_rating, { compatibility: 70, conversation: 4, connection: 3 })
  assert.deepEqual(match.received_rating, { compatibility: 85, conversation: 5, connection: 4 })
  assert.equal(match.given_note, "Warm conversation")
  assert.match(match.received_note, /Friendly/)
  assert.doesNotMatch(JSON.stringify(result), /wantConnect|participantMessage|phone_number|survey_data|example\.com|secret\.test|5555|private message/)
})

test("user 7 has only a basic profile; their pairs, groups, ratings and notes never appear in others' history", () => {
  const data = { ...base, matches: [{ event_id: 25, participant_number: 12, phase2_partner: 7, phase2_feedback: { organizerImpression: "HIDDEN" } }], assignments: [12, 7, 23].map(participant_id => ({ event_id: 25, participant_id, match_id: "e3", round: 1, table_number: 1 })), groupFeedback: [{ event_id: 25, group_round: 1, reviewer_number: 7, member_number: 12, organizer_note: "HIDDEN" }], notes: [{ event_id: 25, scope_type: "pair", round: 20, participant_number: 7, participant2_number: 12, note: "HIDDEN" }] }
  const result = buildCohostAttendeeHistory(data)
  assert.deepEqual(result.history[0].matches, [])
  assert.deepEqual(result.history[0].groups, [])
  assert.doesNotMatch(JSON.stringify(result), /HIDDEN|"number":7|"partner_number":7/)
  const protectedResult = buildCohostAttendeeHistory({ ...data, target: 7 })
  assert.equal(protectedResult.participant.number, 7)
  assert.deepEqual(protectedResult.history, [])
  assert.equal(protectedResult.has_more, false)
})

test("group feedback remains connected to the correct group and excludes test data and private fields", () => {
  const result = buildCohostAttendeeHistory({ ...base,
    assignments: [12, 23, 24].map(participant_id => ({ event_id: 25, participant_id, match_id: "e3", round: 2, table_number: 4 })),
    groupFeedback: [
      { event_id: 25, group_round: 2, reviewer_number: 23, member_number: 12, experience: "great", tags: ["respectful", "secret"], organizer_note: "Listens well", token: "secret" },
      { event_id: 25, group_round: 2, reviewer_number: 12, member_number: 24, experience: "good", tags: ["fun"] },
      { event_id: 25, group_round: 2, reviewer_number: 24, member_number: 12, experience: "neutral", is_test_mode: true, organizer_note: "SIMULATED" },
      { event_id: 25, group_round: 1, reviewer_number: 23, member_number: 12, organizer_note: "WRONG ROUND" },
    ] })
  const group = result.history[0].groups[0]
  assert.equal(group.table, 4)
  assert.equal(group.received.length, 1)
  assert.equal(group.given.length, 1)
  assert.deepEqual(group.received[0].tags, ["respectful"])
  assert.doesNotMatch(JSON.stringify(result), /SIMULATED|WRONG ROUND|secret/)
})

test("legacy feedback uses exact event/round and Event3 ignores stale nonreciprocal partners", () => {
  const result = buildCohostAttendeeHistory({ ...base,
    results: [{ event_id: 24, round: 2, participant_a_number: 12, participant_b_number: 23, compatibility_score: 71 }],
    legacyFeedback: [
      { event_id: 24, round: 1, participant_number: 23, organizer_impression: "WRONG ROUND" },
      { event_id: 23, round: 2, participant_number: 23, organizer_impression: "WRONG EVENT" },
      { event_id: 24, round: 2, participant_number: 23, compatibility_rate: 80, organizer_impression: "Correct impression", participant_message: "PRIVATE MESSAGE" },
    ],
    matches: [
      { event_id: 25, participant_number: 12, phase2_partner: 23 },
      { event_id: 25, participant_number: 23, phase2_partner: 24, phase2_feedback: { organizerImpression: "ABOUT SOMEONE ELSE" } },
      { event_id: 25, participant_number: 29, phase2_partner: 12, phase2_feedback: { organizerImpression: "STALE MATCH" } },
    ] })
  assert.equal(result.history.find(event => event.event_id === 24).matches[0].received_note, "Correct impression")
  assert.equal(result.history.find(event => event.event_id === 25).matches.length, 1)
  assert.equal(result.history.find(event => event.event_id === 25).matches[0].received_note, null)
  assert.doesNotMatch(JSON.stringify(result), /WRONG ROUND|WRONG EVENT|PRIVATE MESSAGE|ABOUT SOMEONE ELSE|STALE MATCH/)
})

test("historical events are bounded and cursor paging never includes current or future events", () => {
  const input = { ...base, currentEventId: 50, roster: Array.from({ length: 51 }, (_, i) => ({ event_id: i + 1 })) }
  const first = buildCohostAttendeeHistory(input)
  assert.equal(first.history.length, 30)
  assert.equal(first.total_events, 49)
  assert.equal(first.history[0].event_id, 49)
  assert.equal(first.has_more, true)
  assert.equal(first.next_before_event_id, 20)
  const second = buildCohostAttendeeHistory({ ...input, beforeEventId: first.next_before_event_id })
  assert.equal(second.history.length, 19)
  assert.equal(second.has_more, false)
  assert.equal(second.history[0].event_id, 19)
})

test("loader checks current roster before profiles/history and fails closed on a read error", async () => {
  const seen = []
  function client(result) {
    return { from(table) {
      seen.push(table)
      const query = { select() { return this }, eq(key, value) { seen.push([key, value]); return this }, maybeSingle() { return Promise.resolve(result) } }
      return query
    } }
  }
  const parameters = { target: 12, currentEventId: 26, event3MatchId: "e3", profileMatchId: "main" }
  assert.deepEqual(await loadCohostAttendeeHistory({ ...parameters, supabase: client({ data: null, error: null }) }), { status: 404, error: "Current attendee not found" })
  assert.deepEqual(seen, ["event3_participants", ["match_id", "e3"], ["event_id", 26], ["participant_number", 12]])
  await assert.rejects(loadCohostAttendeeHistory({ ...parameters, supabase: client({ data: null, error: new Error("database unavailable") }) }), /database unavailable/)
})

test("endpoint is a locked cohost action pinned to real event and disallows response caching", async () => {
  const source = await readFile(new URL("../../api/admin/index.mjs", import.meta.url), "utf8")
  const action = source.slice(source.indexOf('if (action === "e3-cohost-attendee-details")'), source.indexOf('if (action === "e3-cohost-dashboard")'))
  assert.match(source.slice(source.indexOf("const EVENT3_COHOST_ACTIONS"), source.indexOf("function cohostTokenSecret")), /"e3-cohost-attendee-details"/)
  assert.match(action, /currentEventId: realEventId/)
  assert.match(action, /Cache-Control", "private, no-store"/)
  assert.match(action, /status\(503\)/)
  assert.ok(source.indexOf('if (data.cohost_locked === true)') < source.indexOf('if (action === "e3-cohost-attendee-details")'))
  assert.doesNotMatch(redactCohostHistoryNote("token=secret-token password=hunter2 123e4567-e89b-12d3-a456-426614174000"), /secret-token|hunter2|123e4567/)
})
