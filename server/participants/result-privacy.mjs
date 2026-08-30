// Apply at the response boundary so all result/history paths use the same rule.
export function protectPartnerPrivacy(result) {
  const mutual = result?.mutual_match === true
  const feedback = result?.partner_feedback
  const { organizerImpression: _privateNote, organizer_impression: _legacyPrivateNote, ...publicFeedback } = feedback || {}
  return {
    ...result,
    partner_phone: mutual ? result.partner_phone ?? null : null,
    partner_wants_match: mutual ? true : null,
    partner_feedback: feedback ? { ...publicFeedback, wantConnect: mutual ? true : null } : null,
  }
}
