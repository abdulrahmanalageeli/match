import assert from "node:assert/strict"
import test from "node:test"
import {
  buildEvent3AssignmentRevision,
  buildEvent3AuxiliaryHeartbeat,
  buildEvent3FeedbackReceipt,
  buildEvent3MembershipSignature,
  buildEvent3PayloadFingerprint,
} from "./participant-api-contract.mjs"

const fulfilled = data => ({ status: "fulfilled", value: { data, error: null } })

test("heartbeat auxiliary failures stay independent from successful fields", () => {
  const projection = buildEvent3AuxiliaryHeartbeat({
    sosResult: fulfilled([{ id: "support-1" }]),
    moodResult: { status: "fulfilled", value: { data: null, error: { code: "synthetic" } } },
    notificationResult: fulfilled({ notif_id: "notice-1", title: "تنبيه", body: null, icon: "info", created_at: "now" }),
  })

  assert.deepEqual(projection.sos_requests, [{ id: "support-1" }])
  assert.equal(Object.hasOwn(projection, "mood_check"), false)
  assert.equal(projection.notification.pending, true)
  assert.deepEqual(projection.auxiliary_stale, ["mood_check"])
  assert.equal(projection.auxiliary_errors.mood_check.code, "EVENT3_MOOD_UNAVAILABLE")
})

test("a rejected auxiliary promise does not suppress other heartbeat data", () => {
  const projection = buildEvent3AuxiliaryHeartbeat({
    sosResult: { status: "rejected", reason: new Error("offline") },
    moodResult: fulfilled(null),
    notificationResult: fulfilled(null),
  })

  assert.equal(Object.hasOwn(projection, "sos_requests"), false)
  assert.deepEqual(projection.mood_check, { pending: false })
  assert.deepEqual(projection.notification, { pending: false })
  assert.deepEqual(projection.auxiliary_stale, ["sos_requests"])
})

test("assignment revision changes for any live reassignment dimension", () => {
  const base = { eventId: 26, round: 20, participantNumber: 7, partnerNumber: 14, tableNumber: 3 }
  const revision = buildEvent3AssignmentRevision(base)
  assert.equal(revision, "e3:26:20:7:14:3")
  assert.notEqual(buildEvent3AssignmentRevision({ ...base, partnerNumber: 15 }), revision)
  assert.notEqual(buildEvent3AssignmentRevision({ ...base, tableNumber: 4 }), revision)
  assert.notEqual(buildEvent3AssignmentRevision({ ...base, eventId: 27 }), revision)
})

test("group assignment revision includes stable sorted tablemate membership", () => {
  const base = { eventId: 26, round: 2, participantNumber: 7, tableNumber: 3 }
  const revision = buildEvent3AssignmentRevision({ ...base, membershipNumbers: [14, 9, 14] })

  assert.equal(buildEvent3MembershipSignature([14, 9, 14]), "9.14")
  assert.equal(revision, buildEvent3AssignmentRevision({ ...base, membershipNumbers: [9, 14] }))
  assert.match(revision, /:members=9\.14$/)
  assert.notEqual(revision, buildEvent3AssignmentRevision({ ...base, membershipNumbers: [9, 15] }))
})

test("payload fingerprints are stable across JSON key order", () => {
  assert.equal(
    buildEvent3PayloadFingerprint({ b: 2, a: { d: 4, c: 3 } }),
    buildEvent3PayloadFingerprint({ a: { c: 3, d: 4 }, b: 2 }),
  )
  assert.notEqual(buildEvent3PayloadFingerprint({ a: 1 }), buildEvent3PayloadFingerprint({ a: 2 }))
})

test("an identical feedback retry returns the canonical saved payload without a conflict", () => {
  const saved = { meetingStatus: "met", comfort: 4, clarity: 3 }
  const receipt = buildEvent3FeedbackReceipt({
    feedback: saved,
    attemptedFeedback: { clarity: 3, comfort: 4, meetingStatus: "met" },
    alreadySaved: true,
  })

  assert.equal(receipt.conflict, false)
  assert.equal(receipt.already_saved, true)
  assert.deepEqual(receipt.saved_feedback, saved)
  assert.equal(receipt.feedback_fingerprint, receipt.attempted_feedback_fingerprint)
})

test("a conflicting feedback retry exposes the canonical answer and both fingerprints", () => {
  const saved = { meetingStatus: "met", comfort: 4, clarity: 3 }
  const receipt = buildEvent3FeedbackReceipt({
    feedback: saved,
    attemptedFeedback: { ...saved, comfort: 2 },
    alreadySaved: true,
  })

  assert.equal(receipt.conflict, true)
  assert.equal(receipt.code, "EVENT3_FEEDBACK_CONFLICT")
  assert.equal(receipt.retryable, false)
  assert.deepEqual(receipt.saved_feedback, saved)
  assert.notEqual(receipt.feedback_fingerprint, receipt.attempted_feedback_fingerprint)
})
