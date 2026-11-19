import type { MarriageBasics } from '../compatibility/marriage';

export function familyContext(gender: string | undefined, basics: MarriageBasics = {}) {
  const suggestNoChildren = basics.maritalStatus === 'never_married' && basics.childrenCount === undefined;
  return {
    askWifeCount: gender === 'man' && basics.maritalStatus === 'married',
    suggestNoChildren,
    childrenCount: suggestNoChildren ? 0 : basics.childrenCount,
  };
}

export function applicableFamilyAnswers<T extends { gender?: string; marriageBasics?: MarriageBasics }>(answers: T): T {
  const basics = answers.marriageBasics;
  if (!basics || basics.currentWives === undefined || familyContext(answers.gender, basics).askWifeCount) return answers;
  const { currentWives: _inapplicable, ...applicable } = basics;
  return { ...answers, marriageBasics: applicable };
}
