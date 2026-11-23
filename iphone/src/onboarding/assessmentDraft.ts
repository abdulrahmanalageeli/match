import { answersFromAssessmentContext, assessmentContextFromAnswers, type AssessmentSource } from '../interview/assessmentContext';
import type { Answers } from './draft';

/** Replace the session's selections while keeping answers outside its questionnaire. */
export function applyAssessmentDraftChoices(saved: Answers, choices: Record<string, string[]>, source: AssessmentSource = 'interview') {
  const removed = assessmentContextFromAnswers(saved, source).filter(({id}) => !choices[id]?.length);
  const cleared = answersFromAssessmentContext(Object.fromEntries(removed.map(({id, values}) => [id, values])), saved, source);
  const selected = answersFromAssessmentContext(choices, saved, source);
  const surveyAnswers = {...saved.surveyAnswers, ...selected.surveyAnswers};
  const personalityAnswers = {...saved.personalityAnswers, ...selected.personalityAnswers};
  for (const key of Object.keys(cleared.surveyAnswers)) delete surveyAnswers[key];
  for (const key of Object.keys(cleared.personalityAnswers)) delete personalityAnswers[key];
  return {surveyAnswers, personalityAnswers};
}
