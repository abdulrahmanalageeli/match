import { createHash } from "node:crypto"

const EVENT3_AUXILIARY_KEYS = Object.freeze([
  "sos_requests",
  "mood_check",
  "notification",
])

function errorCodeForAuxiliary(key) {
  if (key === "sos_requests") return "EVENT3_SUPPORT_UNAVAILABLE"
  if (key === "mood_check") return "EVENT3_MOOD_UNAVAILABLE"
  return "EVENT3_NOTIFICATION_UNAVAILABLE"
}

/**
 * Project optional heartbeat reads without allowing one failed table to hide
 * the authoritative phase, timer, enrollment, or assignment state.
 *
 * Failed auxiliary fields are deliberately omitted. The participant client
 * can retain its last successful value for that field while still applying
 * the fresh core heartbeat.
 */
export function buildEvent3AuxiliaryHeartbeat({ sosResult, moodResult, notificationResult } = {}) {
  const results = {
    sos_requests: sosResult,
    mood_check: moodResult,
    notification: notificationResult,
  }
  const value = {}
  const auxiliaryErrors = {}

  for (const key of EVENT3_AUXILIARY_KEYS) {
    const result = results[key]
    if (result?.status === "fulfilled" && !result.value?.error) {
      const data = result.value?.data
      if (key === "sos_requests") value.sos_requests = data || []
      if (key === "mood_check") {
        value.mood_check = data
          ? { pending: true, check_id: data.check_id, triggered_at: data.triggered_at }
          : { pending: false }
      }
      if (key === "notification") {
        value.notification = data
          ? {
              pending: true,
              notif_id: data.notif_id,
              title: data.title,
              body: data.body,
              icon: data.icon,
              created_at: data.created_at,
            }
          : { pending: false }
      }
      continue
    }

    auxiliaryErrors[key] = {
      code: errorCodeForAuxiliary(key),
      retryable: true,
    }
  }

  if (Object.keys(auxiliaryErrors).length > 0) {
    value.auxiliary_errors = auxiliaryErrors
    value.auxiliary_stale = Object.keys(auxiliaryErrors)
  } else {
    value.auxiliary_errors = {}
    value.auxiliary_stale = []
  }
  return value
}

function revisionPart(value) {
  if (value === null || value === undefined || value === "") return "pending"
  return encodeURIComponent(String(value))
}

/**
 * A public, non-secret identity for the currently displayed seat assignment.
 * It changes when the event, slot, partner, or table changes, allowing clients
 * to reset arrival state after an organizer correction without a schema field.
 */
export function buildEvent3AssignmentRevision({
  eventId,
  round,
  participantNumber,
  partnerNumber = null,
  tableNumber = null,
  membershipNumbers,
} = {}) {
  const revision = ["e3", eventId, round, participantNumber, partnerNumber, tableNumber]
    .map(revisionPart)
    .join(":")
  if (!Array.isArray(membershipNumbers)) return revision
  return `${revision}:members=${revisionPart(buildEvent3MembershipSignature(membershipNumbers) || "none")}`
}

export function buildEvent3MembershipSignature(numbers = []) {
  return [...new Set((numbers || []).map(Number).filter(Number.isInteger))]
    .sort((a, b) => a - b)
    .join(".")
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]),
  )
}

export function buildEvent3PayloadFingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(value ?? null)))
    .digest("hex")
}

/**
 * Return an idempotent write receipt. A retry of the same payload is success;
 * a different payload is an explicit conflict carrying the canonical saved
 * value, so the client never mistakes an older first-write for its new answer.
 */
export function buildEvent3FeedbackReceipt({ feedback, attemptedFeedback, alreadySaved = false }) {
  const feedbackFingerprint = buildEvent3PayloadFingerprint(feedback || null)
  const attemptedFingerprint = attemptedFeedback === undefined
    ? null
    : buildEvent3PayloadFingerprint(attemptedFeedback || null)
  const conflict = alreadySaved && attemptedFingerprint != null && attemptedFingerprint !== feedbackFingerprint

  return {
    message: conflict
      ? "يوجد تقييم مختلف محفوظ مسبقاً. أعدنا لك النسخة المحفوظة حتى لا تضيع أي إجابة."
      : alreadySaved ? "تم حفظ هذا التقييم مسبقاً" : "تم حفظ التقييم",
    ...(conflict ? {
      error: "التقييم المرسل يختلف عن النسخة المحفوظة.",
      code: "EVENT3_FEEDBACK_CONFLICT",
      retryable: false,
    } : {}),
    already_saved: alreadySaved,
    conflict,
    saved_feedback: feedback || null,
    feedback_fingerprint: feedbackFingerprint,
    ...(attemptedFingerprint != null ? { attempted_feedback_fingerprint: attemptedFingerprint } : {}),
  }
}
