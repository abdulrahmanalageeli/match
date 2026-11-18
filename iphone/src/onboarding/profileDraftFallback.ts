import type { Answers } from './draft';

const occupationalStatements: Record<string, string> = {
  'أعمال حرة وريادة أعمال': 'أعمل في ريادة الأعمال.',
  'عمل مستقل': 'أعمل بشكل مستقل.',
  'طالب / طالبة': 'أدرس حاليًا.',
  'متفرغ / متفرغة للمنزل': 'أتفرّغ حاليًا للمنزل.',
  'باحث / باحثة عن عمل': 'أبحث حاليًا عن عمل.',
  'متقاعد / متقاعدة': 'تقاعدت من العمل.',
  'لا أعمل حاليًا': 'لا أعمل حاليًا.',
  'مجال مهني آخر': '',
};

/** Only facts already destined for the public profile may seed its biography. */
export function generatedBio({ city, profession }: Answers, variant = 0) {
  const residence = city.trim();
  const work = profession.trim();
  const occupation = occupationalStatements[work] ?? (work && (variant % 2 ? `مجالي ${work}.` : `أعمل في مجال ${work}.`));
  const parts = variant % 2
    ? [occupation, residence && `أقيم في ${residence}.`]
    : [residence && `أعيش في ${residence}.`, occupation];
  return parts.filter(Boolean).join(' ');
}
