/**
 * Keep the local recovery draft until the server explicitly confirms that the
 * survey was saved. Rejections and failed saves deliberately leave it intact.
 */
export async function submitSurveyAndClearDraft({ data, onSubmit, clearDraft }) {
  const saved = await onSubmit(data)
  if (saved === true) clearDraft()
  return saved === true
}
