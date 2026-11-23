import { dimensionsForVersion, hasPartnerQuestion } from '../compatibility/practical-catalog.ts';
import { personalityQuestionsFor } from '../compatibility/personality.ts';
import type { InterviewAnswers } from './model';

export type AssessmentSource = 'interview' | 'manual';
type Versions = {assessmentVersion?: string; personalityVersion?: string};

function practicalVersion(version: string | undefined, source: AssessmentSource) {
  // The interview endpoint supports its current and v3 catalogs. Local drafts can use any registered catalog.
  return source === 'interview' && version && version !== 'marriage-v4' ? 'marriage-v3' : version;
}

/** Only answers explicitly selected in the existing form become known context. */
export function assessmentContextFromAnswers(answers: InterviewAnswers & Versions, source: AssessmentSource = 'interview') {
  const context: Array<{id: string; values: string[]}> = [];
  const version = practicalVersion(answers.assessmentVersion, source);
  for (const dimension of dimensionsForVersion(version)) for (const side of ['self', 'partner'] as const) {
    if (side === 'partner' && !hasPartnerQuestion(dimension.id, version)) continue;
    const value = answers.surveyAnswers?.[side === 'self' ? dimension.id : dimension.partnerId];
    if (value && dimension.options.some(option => option.code === value)) {
      context.push({id: `preference:${dimension.id}:${side}`, values: [value]});
    }
  }
  for (const question of personalityQuestionsFor(answers.personalityVersion)) {
    const value = answers.personalityAnswers?.[question.id];
    if (value && question.options.some(option => option.code === value)) context.push({id: `personality:${question.id}:self`, values: [value]});
  }
  return context;
}

export function answersFromAssessmentContext(choices: Record<string, string[]>, versions: Versions, source: AssessmentSource) {
  const surveyAnswers: Record<string, string> = {};
  const personalityAnswers: Record<string, string> = {};
  const version = practicalVersion(versions.assessmentVersion, source);
  for (const dimension of dimensionsForVersion(version)) for (const side of ['self', 'partner'] as const) {
    if (side === 'partner' && !hasPartnerQuestion(dimension.id, version)) continue;
    const values = choices[`preference:${dimension.id}:${side}`];
    if (values?.length === 1 && dimension.options.some(option => option.code === values[0])) {
      surveyAnswers[side === 'self' ? dimension.id : dimension.partnerId] = values[0];
    }
  }
  for (const question of personalityQuestionsFor(versions.personalityVersion)) {
    const values = choices[`personality:${question.id}:self`];
    if (values?.length === 1 && question.options.some(option => option.code === values[0])) personalityAnswers[question.id] = values[0];
  }
  return {surveyAnswers, personalityAnswers};
}
