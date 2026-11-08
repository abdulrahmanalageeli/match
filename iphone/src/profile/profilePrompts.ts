// These prompts use the existing public story fields and their save/review rules.
// No private assessment answers are used to fill a public prompt.
export const profilePrompts = [
  { key: 'lookingFor', title: 'الشريك الذي أتمناه', question: 'ما الذي يجعلني أرتاح لشريك حياتي؟', hint: 'صفة أو تصرّف يهمك، وكيف يظهر في الحياة اليومية.', placeholder: 'أرتاح لمن يسأل ويفهم قبل أن يحكم، ونتشارك القرارات الصغيرة…' },
  { key: 'lifeTogether', title: 'الحياة التي أتخيلها', question: 'كيف أتخيّل يومنا المثالي؟', hint: 'تفصيل بسيط من البيت أو الوقت الذي تتمنّى أن تشاركاه.', placeholder: 'قهوة هادئة، مشوار قصير، وحديث عن يومنا دون انشغال…' },
  { key: 'valuesStatement', title: 'ما أقدّره في العلاقة', question: 'ما الذي أتمنى أن يفهمه شريكي عنّي؟', hint: 'قيمة أو احتياج يساعد الآخر على فهمك والتعامل معك.', placeholder: 'أحتاج بعض الهدوء بعد يوم مزدحم؛ مساحتي لا تعني ابتعادي…' },
] as const;

export type ProfilePromptKey = typeof profilePrompts[number]['key'];
export type ProfilePromptAnswers = Partial<Record<ProfilePromptKey, string>>;

export function answeredProfilePrompts(answers: ProfilePromptAnswers) {
  return profilePrompts.flatMap(prompt => {
    const answer = answers[prompt.key]?.trim();
    return answer ? [{ ...prompt, answer }] : [];
  });
}
