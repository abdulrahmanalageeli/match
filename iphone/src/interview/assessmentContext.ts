import { dimensions } from '../compatibility/model';
import { personalityQuestions } from '../compatibility/personality';
import type { InterviewAnswers } from './model';

/** Only answers explicitly selected in the existing form become known context. */
export function assessmentContextFromAnswers(answers: InterviewAnswers): Array<{ id: string; values: string[] }> {
  const context: Array<{ id: string; values: string[] }> = [];
  for (const dimension of dimensions) for (const side of ['self', 'partner'] as const) {
    const value = answers.surveyAnswers?.[side === 'self' ? dimension.id : dimension.partnerId];
    if (dimension.options.some(option => option.code === value)) context.push({ id: `preference:${dimension.id}:${side}`, values: [value!] });
  }
  for (const question of personalityQuestions) {
    const value = answers.personalityAnswers?.[question.id];
    if (question.options.some(option => option.code === value)) context.push({ id: `personality:${question.id}:self`, values: [value!] });
  }
  return context;
}

export function answersFromAssessmentContext(choices: Record<string, string[]>): Pick<InterviewAnswers, 'surveyAnswers' | 'personalityAnswers'> {
  const surveyAnswers: Record<string, string> = {};
  const personalityAnswers: Record<string, string> = {};
  for (const dimension of dimensions) {
    for (const side of ['self', 'partner'] as const) {
      const values = choices[`preference:${dimension.id}:${side}`];
      if (values?.length === 1 && dimension.options.some(option => option.code === values[0])) {
        surveyAnswers[side === 'self' ? dimension.id : dimension.partnerId] = values[0];
      }
    }
  }
  for (const question of personalityQuestions) {
    const values = choices[`personality:${question.id}:self`];
    if (values?.length === 1 && question.options.some(option => option.code === values[0])) {
      personalityAnswers[question.id] = values[0];
    }
  }
  return { surveyAnswers, personalityAnswers };
}
