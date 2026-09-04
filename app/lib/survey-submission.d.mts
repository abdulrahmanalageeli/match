export interface SurveySubmissionOptions<T> {
  data: T
  onSubmit: (data: T) => boolean | Promise<boolean>
  clearDraft: () => void
}

export function submitSurveyAndClearDraft<T>(options: SurveySubmissionOptions<T>): Promise<boolean>
