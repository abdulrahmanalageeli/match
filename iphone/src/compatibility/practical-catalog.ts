import current from './catalog.json' with { type: 'json' };
import v1 from './catalog-v1.json' with { type: 'json' };
import v2 from './catalog-v2.json' with { type: 'json' };
import legacy from './catalog-v3.json' with { type: 'json' };
import { parentingApplicable } from './parenting.mjs';
import type { PartnerCriteria } from './marriage.ts';

export const assessmentVersion = 'marriage-v4' as const;
export const dimensions = current.dimensions;
export const categories = current.categories;

export function dimensionsForVersion(version?: string) {
  if (version === 'marriage-v1' || version === 'legacy-v0') return v1.dimensions;
  if (version === 'marriage-v2') return v2.dimensions;
  return version === 'marriage-v3' ? legacy.dimensions : dimensions;
}

export function hasPartnerQuestion(topicId: string, version?: string) {
  return topicId !== 'residence_plan' || Boolean(version && version !== assessmentVersion);
}

export function practicalAnswerKeys(topic: { id: string; partnerId: string }, version?: string) {
  return hasPartnerQuestion(topic.id, version) ? [topic.id, topic.partnerId] : [topic.id];
}

export function applicableDimensions(version: string | undefined, answers: Readonly<Record<string, string>> | undefined, childrenCount: number | undefined, partnerChildren: PartnerCriteria['children']) {
  const topics = dimensionsForVersion(version);
  return (version === assessmentVersion || !version) && !parentingApplicable(answers, childrenCount, partnerChildren)
    ? topics.filter(topic => topic.id !== 'parenting_approach') : topics;
}
