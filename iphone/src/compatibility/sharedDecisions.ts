// Each code in these pairs describes an agreement for both people. Personal
// habits and reactions have independent self and partner questions.
const prompts: Record<string, string> = {
  children_plan: 'وش تتمنى يكون قراركما بخصوص الإنجاب؟',
  marriage_timeline: 'متى يناسبك أن تأخذا أول خطوة رسمية معًا؟',
  wife_work: 'أي ترتيب لعمل الزوجة يناسبك وتفضّل أن تتفقا عليه؟',
  family_authority: 'إذا اعترض الأهل على قرار يخص بيتكما، كيف تفضّل أن تحسماه معًا؟',
  financial_provision: 'إذا كان لكل واحد منكما دخل، كيف تفضّل أن تغطّيا مصاريف البيت؟',
  domestic_labor: 'أي توزيع لأعمال البيت تفضّل أن تتفقا عليه؟',
  housing_arrangement: 'أي ترتيب للسكن تفضّل أن تتفقا عليه من بداية الزواج؟',
  money_management: 'إذا بقي مبلغ إضافي في ميزانية البيت، كيف تفضّل أن تتصرّفا فيه؟',
  faith_routine: 'أي اتفاق يناسبكما في روتين العبادة داخل البيت؟',
};

export function sharedDecisionPrompt(topic: string, gender?: string): string | undefined {
  return topic === 'wife_work' && gender === 'woman'
    ? 'أي ترتيب يناسبك لعملك بعد الزواج وتفضّلين أن يشاركك زوجك فيه؟'
    : prompts[topic];
}

export function sharedDecisionLabel(topic:string, code:string, fallback:string): string {
  if (topic === 'children_plan') {
    if (code === 'A') return 'أرغب أن ننجب';
    if (code === 'B') return 'أفضّل أن تكون حياتنا دون أطفال';
    if (code === 'C') return 'ما حسمت قراري وأرتاح لشريك مثلي';
  }
  if (topic === 'marriage_timeline' && code === 'D') return 'أفضل أن نترك الموعد مفتوحًا الآن';
  return fallback;
}
