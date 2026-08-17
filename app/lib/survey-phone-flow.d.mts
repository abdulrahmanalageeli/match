export interface SurveyPhoneDuplicateCheckContext {
  isNewRegistration: boolean
  currentPage: number
  phoneQuestionPage: number
}

export function shouldRunSurveyPhoneDuplicateCheck(
  context: SurveyPhoneDuplicateCheckContext,
): boolean
