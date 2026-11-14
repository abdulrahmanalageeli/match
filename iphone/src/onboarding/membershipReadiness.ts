export const membershipAgreementVersion = 'wudayn-membership-v1';

export const readinessScenarios = {
  family: {
    question: 'لو ظهر توافق مناسب للزواج والطرف الآخر يفضّل إشراك الأهل بدري، وش يناسبك؟',
    options: {
      early: 'أرتاح لإشراك الأهل من البداية',
      discuss: 'نتفق على التوقيت اللي يناسبنا',
      later: 'أفضل وقتًا أطول قبل إشراكهم',
    },
  },
  nextStep: {
    question: 'لو كان التوافق واضحًا، وش الخطوة اللي تقدر تبدأها؟',
    options: {
      soon: 'أقدر أبدأ خطوة رسمية قريب',
      after_agreement: 'أحتاج أتفق أولًا على الخطوة والوقت',
      not_yet: 'ما أقدر أبدأ خطوة رسمية الآن',
    },
  },
} as const;

export const readinessClarifications = {
  family: {
    question: 'قلت إنك تفضّل إشراك الأهل من البداية، وفي الموقف اخترت وقتًا أطول. وش يوضّح الفرق؟',
    options: { context: 'يعتمد على الشخص وظروفنا', review: 'أحتاج أتفق على التوقيت قبل ما أقرره' },
  },
  nextStep: {
    question: 'اخترت خطوة رسمية خلال ستة أشهر، وقلت إنك ما تقدر تبدأها الآن. كيف تجمع بين الاثنين؟',
    options: { context: 'هذا توقيتي المتوقع، لكن عندي ظروف الآن', review: 'موعدي الفعلي للحين غير محدد' },
  },
} as const;

export type ReadinessTopic = keyof typeof readinessScenarios;
export type MembershipReadiness = {
  family?: keyof typeof readinessScenarios.family.options;
  nextStep?: keyof typeof readinessScenarios.nextStep.options;
  clarifications?: Partial<Record<ReadinessTopic, 'context' | 'review'>>;
  agreement?: typeof membershipAgreementVersion;
};

export function validReadiness(value: unknown): value is MembershipReadiness {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !['family','nextStep','clarifications','agreement'].includes(key))) return false;
  for (const topic of ['family', 'nextStep'] as const) {
    const choice = record[topic];
    if (choice !== undefined && (typeof choice !== 'string' || !Object.hasOwn(readinessScenarios[topic].options, choice))) return false;
  }
  if (record.agreement !== undefined && record.agreement !== membershipAgreementVersion) return false;
  const notes = record.clarifications;
  return notes === undefined || Boolean(notes && typeof notes === 'object' && !Array.isArray(notes) &&
    Object.entries(notes).every(([key, item]) => (key === 'family' || key === 'nextStep') && (item === 'context' || item === 'review')));
}

export function readinessConflicts(value: MembershipReadiness, familyPreference: string, formalTiming?: string): ReadinessTopic[] {
  const topics: ReadinessTopic[] = [];
  if (value.family === 'later' && familyPreference === 'من البداية') topics.push('family');
  if (value.nextStep === 'not_yet' && formalTiming === 'A') topics.push('nextStep');
  return topics;
}

export function readinessComplete(value: MembershipReadiness, topics: ReadinessTopic[]) {
  return Boolean(value.family && value.nextStep && value.agreement === membershipAgreementVersion &&
    topics.every(topic => value.clarifications?.[topic]));
}
import catalog from '../compatibility/catalog.json' with { type: 'json' };
import type { Profile } from '../types';


export type ReadinessAnswers = Pick<Profile, 'surveyAnswers' | 'hardRequirements' | 'priorityCategories' | 'lookingFor' | 'lifeTogether' | 'personalityAnswers'>
  & { gender?: Profile['gender'] | '' };

/** A private reflection of reviewed choices, without predicting intent or relationship outcomes. */
export function readinessBlueprint(answers: ReadinessAnswers, value: MembershipReadiness, conflicts: ReadinessTopic[]) {
  const survey = answers.surveyAnswers ?? {};
  const described = catalog.dimensions.flatMap(dimension => {
    const own = dimension.options.find(option => option.code === survey[dimension.id]);
    const partner = dimension.options.find(option => option.code === survey[dimension.partnerId]);
    if (!own || !partner) return [];
    const firm = answers.hardRequirements?.includes(dimension.id) ?? false;
    const priority = answers.priorityCategories?.includes(dimension.category) ?? false;
    const femaleWork = ['أرغب في العمل ومواصلة طموحي', 'أفضل عدم العمل بعد الزواج', 'مرنة حسب ظروفي واتفاقنا'];
    return [{
      id: dimension.id, title: dimension.title, own: dimension.id === 'wife_work' && answers.gender === 'woman'
        ? femaleWork[dimension.options.indexOf(own)] ?? own.self : own.self,
      partner: partner.partner, firm, priority,
    }];
  });
  const ranked = [...described].sort((a, b) => Number(b.firm) - Number(a.firm) || Number(b.priority) - Number(a.priority));
  const discussion: string[] = [];
  if (value.family === 'later' || conflicts.includes('family')) discussion.push('اتفقا على المدة المناسبة قبل إشراك الأهل.');
  if (value.nextStep === 'not_yet' || conflicts.includes('nextStep') || survey.marriage_timeline === 'D') {
    discussion.push('وضّح توقيت الخطوة الرسمية وما تحتاجه للاستعداد لها.');
  }
  if (survey.children_plan === 'C') discussion.push('رغبتك في الإنجاب لم تُحسم. ناقشاها قبل الاتفاق النهائي.');
  if (survey.residence_plan === 'A') discussion.push('مدينة الاستقرار نقطة مهمّة إذا كان الطرف الآخر في مدينة مختلفة.');
  const personality = answers.personalityAnswers ?? {};
  if (['D', 'E'].includes(personality.conflict_pace ?? '') && ['A', 'B'].includes(personality.directness ?? '')) {
    discussion.push('تميل لمناقشة الخلاف بسرعة، والتعبير المباشر عن احتياجك أقل شيوعًا عندك. اتفقا على طريقة توضيح ما يزعجكما.');
  }
  return {
    preferences: ranked.slice(0, 3),
    partnership: (answers.lookingFor?.trim() || answers.lifeTogether?.trim() || '').slice(0, 600),
    discussion: discussion.slice(0, 2),
  };
}
