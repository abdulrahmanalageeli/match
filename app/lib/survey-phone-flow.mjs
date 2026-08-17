/**
 * Phone-account lookup is part of registration only. Survey edit state is
 * intentionally explicit because typing into a new survey also sets the
 * legacy `isEditingSurvey` UI flag.
 */
export function shouldRunSurveyPhoneDuplicateCheck({
  isNewRegistration,
  currentPage,
  phoneQuestionPage,
}) {
  return isNewRegistration === true && currentPage === phoneQuestionPage
}
