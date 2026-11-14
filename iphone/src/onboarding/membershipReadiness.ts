export const membershipAgreementVersion = 'wudayn-membership-v1';

export const readinessScenarios = {
  family: {
    question: 'لو ارتحت لشخص وطلب إشراك الأهل بدري، وش يناسبك؟',
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
