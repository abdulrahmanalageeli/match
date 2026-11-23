import type { InterviewDocument, InterviewStatement } from './types';
import type { ProfileContext } from './profileCapture';
type RefinementTopic = 'height' | 'age' | 'timeline';
type RefinableStatement = InterviewStatement & { topic: RefinementTopic };

export function nextRefinement(doc: InterviewDocument, context?: ProfileContext, choices?: Record<string, string[]>, manual?: boolean): RefinableStatement | undefined;
