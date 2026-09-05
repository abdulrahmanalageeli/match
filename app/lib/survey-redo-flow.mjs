/**
 * A survey update/recovery link is an explicit request to open the existing
 * questionnaire for editing. It must take precedence over the generic
 * "survey already filled" prompt used during an ordinary token visit.
 */
export function isSurveyRedoRequest({ redo, flow } = {}) {
  return redo === '1' || redo === 'true' || flow === 'redo'
}

export function shouldShowFilledSurveyPrompt({
  hasFilledForm,
  eventPhase,
  isJustCreatedUser,
  isRedoRequest,
}) {
  return Boolean(
    hasFilledForm
    && eventPhase === 'form'
    && !isJustCreatedUser
    && !isRedoRequest
  )
}
