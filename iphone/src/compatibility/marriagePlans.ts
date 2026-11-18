/** Explicit public preferences, separate from the versioned compatibility score. */
export const marriagePlanQuestions = {
  weddingStyle: {
    label: 'حفل الزواج والميزانية', question: 'كيف تتصور حفل الزواج وميزانيته؟',
    options: { simple: 'حفل بسيط للأهل والمقرّبين وتكاليف محدودة', moderate: 'حفل متوسط بميزانية متفق عليها', larger: 'حفل أكبر مع تخصيص ميزانية مناسبة له', discuss: 'نتفق على حجم الحفل والميزانية حسب ظروفنا' },
  },
  childrenTiming: {
    label: 'توقيت الإنجاب', question: 'إذا كنت ترغب في الإنجاب، متى تفضّل البدء؟',
    options: { first_year: 'خلال السنة الأولى من الزواج', after_one_two_years: 'بعد سنة إلى سنتين', after_two_years: 'بعد أكثر من سنتين', discuss: 'نتفق على التوقيت عندما نكون مستعدّين' },
  },
  housingPlan: {
    label: 'ترتيب السكن', question: 'ما ترتيب السكن الذي يناسبك بعد الزواج؟',
    options: { independent: 'منزل مستقل عن الأهل', separate_family_building: 'وحدة مستقلة في مبنى العائلة', with_family: 'السكن مع الأهل في المنزل نفسه', discuss: 'منفتح على الاتفاق حسب الظروف' },
  },
  expenseSharing: {
    label: 'توزيع مصاريف البيت', question: 'كيف تتصور توزيع مصاريف البيت بعد الزواج؟',
    options: { husband_essentials: 'الزوج يتحمّل الأساسيات، ومساهمة الزوجة اختيارية', proportional: 'نتشارك بحسب دخل كل طرف', equal: 'نتشارك بالتساوي — ٥٠/٥٠', discuss: 'نتفق على التفاصيل حسب ظروفنا' },
  },
} as const;
export type MarriagePlans = { [K in keyof typeof marriagePlanQuestions]?: keyof typeof marriagePlanQuestions[K]['options'] };
export const marriagePlanKeys = Object.keys(marriagePlanQuestions) as (keyof MarriagePlans)[];
export function marriagePlanLabel(key: keyof MarriagePlans, value: string | undefined): string | undefined {
  const options = marriagePlanQuestions[key].options;
  return value && Object.hasOwn(options, value) ? (options as Record<string, string>)[value] : undefined;
}
