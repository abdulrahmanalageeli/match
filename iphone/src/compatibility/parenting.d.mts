import type { PartnerCriteria } from './marriage.ts';

export function parentingApplicable(surveyAnswers: Readonly<Record<string, string>> | undefined, childrenCount: number | undefined, partnerChildren: PartnerCriteria['children']): boolean;
export function parentingContext(fields: ReadonlyArray<{fieldId: string; values: readonly string[]; mode: string | null; exclude: boolean; needsClarification?: boolean}>): {
  childrenCount: 0 | undefined;
  partnerChildren: PartnerCriteria['children'];
};
