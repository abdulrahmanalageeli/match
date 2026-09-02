import {
  LEGAL_ACCEPTED_DOCUMENT_VERSIONS,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_PRIVACY_NOTICE_VERSION,
  LEGAL_TERMS_VERSION,
  isAcceptedLegalBundle,
} from "../../app/lib/legal-version.mjs"

export {
  LEGAL_ACCEPTED_DOCUMENT_VERSIONS,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_PRIVACY_NOTICE_VERSION,
  LEGAL_TERMS_VERSION,
  isAcceptedLegalBundle,
}

function parseSurveyData(value) {
  if (!value) return null
  if (typeof value === "object" && !Array.isArray(value)) return value
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function hasCurrentLegalAcceptance(participant, acceptance) {
  if (!participant) return false
  const ledgerIsCurrent = isAcceptedLegalBundle(acceptance)
  const participantIsCurrent = isAcceptedLegalBundle(participant)
    && Boolean(participant.consented_at)
  return ledgerIsCurrent || participantIsCurrent
}

export function shouldRequireLegalAcceptance(participant, acceptance) {
  if (!participant) return false
  const surveyData = parseSurveyData(participant.survey_data)
  const hasExistingProfile = Boolean(surveyData && Object.keys(surveyData).length > 0)
  return hasExistingProfile && !hasCurrentLegalAcceptance(participant, acceptance)
}

export function buildLegalAcceptanceRow(participant, {
  source = "participant_popup",
  eventId = null,
  acceptedAt = new Date().toISOString(),
} = {}) {
  if (!participant?.id || !Number.isInteger(Number(participant.assigned_number))) {
    throw new TypeError("A persisted participant is required")
  }
  return {
    participant_id: participant.id,
    assigned_number: Number(participant.assigned_number),
    document_bundle_version: LEGAL_DOCUMENT_VERSION,
    terms_version: LEGAL_TERMS_VERSION,
    privacy_notice_version: LEGAL_PRIVACY_NOTICE_VERSION,
    acceptance_source: source,
    accepted_at: acceptedAt,
    event_id: Number.isInteger(Number(eventId)) && Number(eventId) > 0 ? Number(eventId) : null,
    document_urls: { terms: "/terms", privacy: "/privacy", event: "/about" },
    updated_at: acceptedAt,
  }
}
